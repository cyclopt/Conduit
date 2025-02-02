import ConduitGrpcSdk, {
  DatabaseProvider,
  ParsedRouterRequest,
  UnparsedRouterResponse,
  GrpcError,
} from '@conduitplatform/conduit-grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { populateArray, wrongFields } from '../utils/utilities';
import { _DeclaredSchema } from '../models';

export class DocumentsAdmin {
  private database!: DatabaseProvider;

  constructor(
    private readonly grpcSdk: ConduitGrpcSdk,
  ) {
    this.database = this.grpcSdk.databaseProvider!;
  }

  async getDocument(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, id, populate } = call.request.params;
    const schema = await _DeclaredSchema.getInstance().findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    let populates;
    if (!isNil(populate)) {
      populates = populateArray(populate);
    }
    const document = await this.database
      .findOne(
        schemaName,
        { _id: id },
        undefined,
        populates,
      );
    if (isNil(document)) {
      throw new GrpcError(status.NOT_FOUND, 'Document does not exist');
    }
    return document;
  }

  async getDocuments(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    let { schemaName, query } = call.request.params;
    const { skip } = call.request.params ?? 0;
    const { limit } = call.request.params ?? 25;
    const schema = await _DeclaredSchema.getInstance().findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }

    if (!query || query.length === '') {
      query = {};
    }

    const documentsPromise = this.database.findMany(
      schemaName,
      query,
      undefined,
      skip,
      limit,
    );
    const countPromise = this.database.countDocuments(schemaName, query);

    const [documents, count] = await Promise.all([
      documentsPromise,
      countPromise,
    ]).catch((e: any) => {
      throw new GrpcError(status.INTERNAL, e.message);
    });

    return { documents, count };
  }

  async createDocument(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, inputDocument } = call.request.params;
    const schema = await _DeclaredSchema.getInstance().findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    return await this.database
      .create(schemaName, inputDocument)
      .catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
  }

  async createDocuments(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, inputDocuments } = call.request.params;
    const schema = await _DeclaredSchema.getInstance().findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    const newDocuments = await this.database
      .createMany(schemaName, inputDocuments)
      .catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    return { docs: newDocuments };
  }

  async updateDocument(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, id, changedDocument } = call.request.params;
    const schema = await _DeclaredSchema.getInstance().findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    const currentFields = Object.keys(schema.fields);
    const changedFields = Object.keys(changedDocument);
    if (!wrongFields(currentFields, changedFields)) {
      throw new GrpcError(status.NOT_FOUND, 'Wrong input fields!');
    }
    const dbDocument = await this.database
      .findOne(schemaName, { _id: id })
      .catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    Object.assign(dbDocument, changedDocument);
    return await this.database
      .findByIdAndUpdate(schemaName, dbDocument._id, dbDocument)
      .catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
  }

  async updateDocuments(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, changedDocuments } = call.request.params;
    const schema = await _DeclaredSchema.getInstance().findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    let updatedDocuments: any[] = [];
    for (const doc of changedDocuments) {
      const dbDocument = await this.database
        .findOne(schemaName, { _id: doc._id })
        .catch((e: any) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });
      Object.assign(dbDocument, doc);
      const updatedDocument = await this.database
        .findByIdAndUpdate(schemaName, dbDocument._id, dbDocument)
        .catch((e: any) => {
          throw new GrpcError(status.INTERNAL, e.message);
        });
      updatedDocuments.push(updatedDocument);
    }
    return { docs: updatedDocuments };
  }

  async deleteDocument(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const { schemaName, id } = call.request.params;
    const schema = await _DeclaredSchema.getInstance()
      .findOne({ name: schemaName });
    if (isNil(schema)) {
      throw new GrpcError(status.NOT_FOUND, 'Schema does not exist');
    }
    await this.database
      .deleteOne(schemaName, { _id: id })
      .catch((e: any) => {
        throw new GrpcError(status.INTERNAL, e.message);
      });
    return 'Ok';
  }
}
