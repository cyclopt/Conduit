import { isNil } from 'lodash';
import {
  GrpcError,
  ParsedRouterRequest,
  UnparsedRouterResponse,
} from '@conduitplatform/conduit-grpc-sdk';
import { status } from '@grpc/grpc-js';
import { NotificationToken } from '../models';

export class NotificationTokensHandler {
  async setNotificationToken(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const context = call.request.context;
    const { token, platform } = call.request.params;
    if (isNil(context) || isNil(context.user)) {
      throw new GrpcError(status.UNAUTHENTICATED, 'Unauthorized');
    }
    if (isNil(token)) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'token is required');
    }
    if (isNil(platform)) {
      throw new GrpcError(status.INVALID_ARGUMENT, 'platform is required');
    }
    const userId = context.user._id;
    NotificationToken.getInstance()
      .findOne({ userId, platform })
      .then((oldToken: any) => {
        if (!isNil(oldToken))
          return NotificationToken.getInstance().deleteOne(oldToken);
      })
      .catch((e: Error) => { throw new GrpcError(status.INTERNAL, e.message); });
    const newTokenDocument = await NotificationToken.getInstance()
      .create({
        userId,
        token,
        platform,
      })
      .catch((e: Error) => { throw new GrpcError(status.INTERNAL, e.message); });
    return {
      message: 'Push notification token created',
      newTokenDocument,
    }
  }
}
