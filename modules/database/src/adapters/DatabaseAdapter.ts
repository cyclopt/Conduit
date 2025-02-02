import { ConduitSchema } from '@conduitplatform/conduit-grpc-sdk';
import { SchemaAdapter } from '../interfaces';
import { _DeclaredSchema } from '../models';

export abstract class DatabaseAdapter<T extends SchemaAdapter<any>> {
  registeredSchemas: Map<string, ConduitSchema>;
  models?: { [name: string]: T };

  /**
   * Should accept a JSON schema and output a .ts interface for the adapter
   * @param schema
   */
  abstract createSchemaFromAdapter(schema: ConduitSchema): Promise<SchemaAdapter<any>>;

  /**
   * Given a schema name, returns the schema adapter assigned
   * @param schemaName
   */
  abstract getSchema(schemaName: string): ConduitSchema;

  abstract getSchemas(): ConduitSchema[];

  abstract async deleteSchema(schemaName: string, deleteData: boolean, callerModule: string): Promise<string>;

  abstract getSchemaModel(
    schemaName: string
  ): { model: SchemaAdapter<any>; relations: any };

  async checkModelOwnership(schema: ConduitSchema) {
    if (schema.name === '_DeclaredSchema') return true;
    const model = await _DeclaredSchema.getInstance().findOne({ name: schema.name });
    if (model && ((model.ownerModule === schema.ownerModule) || (model.ownerModule === 'unknown'))) {
      return true;
    } else if (model) {
      return false;
    }
    return true;
  }

  protected async saveSchemaToDatabase(schema: ConduitSchema) {
    if (schema.name === '_DeclaredSchema') return;

    const model = await _DeclaredSchema.getInstance().findOne({ name: schema.name });
    if (model) {
      await _DeclaredSchema.getInstance()
        .findByIdAndUpdate(
          model._id,
          {
            name: schema.name,
            fields: schema.fields,
            modelOptions: schema.schemaOptions,
            ownerModule: schema.ownerModule,
          }
        );
    } else {
      await _DeclaredSchema.getInstance()
        .create({
          name: schema.name,
          fields: schema.fields,
          modelOptions: schema.schemaOptions,
          ownerModule: schema.ownerModule,
        });
    }
  }

  async recoverSchemasFromDatabase(): Promise<any> {
    let models: any = await _DeclaredSchema.getInstance().findMany({});
    models = models
      .map((model: any) => {
        let schema = new ConduitSchema(
          model.name,
          model.fields,
          model.modelOptions
        );
        schema.ownerModule = model.ownerModule;
        return schema;
      })
      .map((model: ConduitSchema) => {
        return this.createSchemaFromAdapter(model);
      });

    await Promise.all(models);
  }

  abstract ensureConnected(): Promise<any>;

  protected addSchemaPermissions(schema: ConduitSchema) {
    const defaultPermissions = {
      extendable: true,
      canCreate: true,
      canModify: 'Everything',
      canDelete: true,
    };
    if (!schema.schemaOptions.hasOwnProperty('conduit')) schema.schemaOptions.conduit = {};
    if (!schema.schemaOptions.conduit!.hasOwnProperty('permissions')) {
      schema.schemaOptions.conduit!.permissions = defaultPermissions;
    } else {
      Object.keys(defaultPermissions).forEach((perm) => {
        if (!schema.schemaOptions.conduit!.permissions.hasOwnProperty(perm)) {
          schema.schemaOptions.conduit!.permissions[perm] = defaultPermissions[perm as keyof typeof defaultPermissions];
        }
      });
    }
    return schema;
  }
}
