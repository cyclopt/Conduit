import { isNil } from 'lodash';
import { ISignTokenOptions } from '../interfaces/ISignTokenOptions';
import { AuthUtils } from '../utils/auth';
import moment from 'moment';
import ConduitGrpcSdk, {
  GrpcError,
  ParsedRouterRequest,
  UnparsedRouterResponse,
} from '@conduitplatform/conduit-grpc-sdk';
import { status } from '@grpc/grpc-js';
import { ConfigController } from '../config/Config.controller';
import { AccessToken, RefreshToken, User } from '../models';

export class CommonHandlers {
  constructor(private readonly grpcSdk: ConduitGrpcSdk) {}

  async renewAuth(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const context = call.request.context;

    const clientId = context.clientId;

    const { refreshToken } = call.request.params;

    const config = ConfigController.getInstance().config;

    const oldRefreshToken: RefreshToken | null = await RefreshToken.getInstance().findOne(
      {
        token: refreshToken,
        clientId,
      }
    );
    if (isNil(oldRefreshToken)) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'Invalid parameters');
    }
    if (moment().isAfter(moment(oldRefreshToken.expiresOn))) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'Token expired');
    }

    await Promise.all(
      AuthUtils.deleteUserTokens(this.grpcSdk, {
        userId: oldRefreshToken.userId,
        clientId,
      })
    );

    const signTokenOptions: ISignTokenOptions = {
      secret: config.jwtSecret,
      expiresIn: config.tokenInvalidationPeriod,
    };

    const newAccessToken: AccessToken = await AccessToken.getInstance().create({
      userId: oldRefreshToken.userId,
      clientId,
      token: AuthUtils.signToken({ id: oldRefreshToken.userId }, signTokenOptions),
      expiresOn: moment().add(config.tokenInvalidationPeriod, 'milliseconds').toDate(),
    });

    const newRefreshToken: RefreshToken = await RefreshToken.getInstance().create({
      userId: oldRefreshToken.userId,
      clientId,
      token: AuthUtils.randomToken(),
      expiresOn: moment()
        .add(config.refreshTokenInvalidationPeriod, 'milliseconds')
        .toDate(),
    });

    return {
      accessToken: newAccessToken.token,
      refreshToken: newRefreshToken.token,
    };
  }

  async logOut(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const context = call.request.context;

    const clientId = context.clientId;
    const user = context.user;

    await Promise.all(
      AuthUtils.deleteUserTokens(this.grpcSdk, {
        userId: user._id,
        clientId,
      })
    );

    return 'Logged out';
  }

  async getUser(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    return call.request.context.user;
  }

  async deleteUser(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const context = call.request.context;

    const user = context.user;
    await User.getInstance().deleteOne({ _id: user._id });

    Promise.all(
      AuthUtils.deleteUserTokens(this.grpcSdk, {
        userId: user._id,
      })
    ).catch((e: any) => console.log('Failed to delete all access tokens'));
    return 'Done';
  }
}
