import {
  ConduitRoute,
  ConduitRouteActions,
  ConduitRouteReturnDefinition,
  constructRoute,
  TYPE,
} from '@quintessential-sft/conduit-grpc-sdk';

export function compareFunction(schemaA: any, schemaB: any): number {
  let hasA = [];
  let hasB = [];
  for (const k in schemaA.fields) {
    if (schemaA.fields[k].model) {
      hasA.push(schemaA.fields[k].model);
    }
  }
  for (const k in schemaB.fields) {
    if (schemaB.fields[k].model) {
      hasB.push(schemaB.fields[k].model);
    }
  }

  if (hasA.length === 0 && hasB.length === 0) {
    return 0;
  } else if (hasA.length === 0 && hasB.length !== 0) {
    if (hasB.indexOf(schemaA.name)) {
      return -1;
    } else {
      return 1;
    }
  } else if (hasA.length !== 0 && hasB.length === 0) {
    if (hasA.indexOf(schemaB.name)) {
      return -1;
    } else {
      return 1;
    }
  } else {
    if (hasA.indexOf(schemaB.name) && hasB.indexOf(schemaA.name)) {
      return 1;
    } else if (hasA.indexOf(schemaB.name)) {
      return -1;
    } else if (hasB.indexOf(schemaA.name)) {
      return 1;
    } else {
      return 1;
    }
  }
}

export function getOps(schemaName: string, actualSchema: any) {
  let routesArray: any = [];
  routesArray.push(
    constructRoute(
      new ConduitRoute(
        {
          path: `/${schemaName}/:id`,
          action: ConduitRouteActions.GET,
          urlParams: {
            id: { type: TYPE.String, required: true },
          },
          middlewares: actualSchema.authentication ? ['authMiddleware'] : undefined,
          cacheControl: actualSchema.authentication
            ? 'private, max-age=10'
            : 'public, max-age=10',
        },
        new ConduitRouteReturnDefinition(`${schemaName}`, actualSchema.fields),
        'getDocumentById'
      )
    )
  );

  routesArray.push(
    constructRoute(
      new ConduitRoute(
        {
          path: `/${schemaName}`,
          action: ConduitRouteActions.GET,
          queryParams: {
            skip: TYPE.Number,
            limit: TYPE.Number,
            sort: [TYPE.String],
          },
          middlewares: actualSchema.authentication ? ['authMiddleware'] : undefined,
          cacheControl: actualSchema.authentication
            ? 'private, max-age=10'
            : 'public, max-age=10',
        },
        new ConduitRouteReturnDefinition(`get${schemaName}`, {
          documents: [actualSchema.fields],
          documentsCount: TYPE.Number,
        }),
        'getDocuments'
      )
    )
  );

  let assignableFields = Object.assign({}, actualSchema.fields);
  delete assignableFields._id;
  delete assignableFields.createdAt;
  delete assignableFields.updatedAt;

  routesArray.push(
    constructRoute(
      new ConduitRoute(
        {
          path: `/${schemaName}`,
          action: ConduitRouteActions.POST,
          bodyParams: assignableFields,
          middlewares: actualSchema.authentication ? ['authMiddleware'] : undefined,
        },
        new ConduitRouteReturnDefinition(`create${schemaName}`, actualSchema.fields),
        'createDocument'
      )
    )
  );

  routesArray.push(
    constructRoute(
      new ConduitRoute(
        {
          path: `/${schemaName}/many`,
          action: ConduitRouteActions.POST,
          bodyParams: { docs: { type: [assignableFields], required: true } },
          middlewares: actualSchema.authentication ? ['authMiddleware'] : undefined,
        },
        new ConduitRouteReturnDefinition(`createMany${schemaName}`, {
          docs: [actualSchema.fields],
        }),
        'createManyDocuments'
      )
    )
  );

  routesArray.push(
    constructRoute(
      new ConduitRoute(
        {
          path: `/${schemaName}/many`,
          action: ConduitRouteActions.UPDATE,
          queryParams: {
            updateProvidedOnly: TYPE.Boolean,
          },
          bodyParams: {
            docs: {
              type: [{ ...assignableFields, _id: { type: 'String', unique: true } }],
              required: true,
            },
          },
          middlewares: actualSchema.authentication ? ['authMiddleware'] : undefined,
        },
        new ConduitRouteReturnDefinition(`updateMany${schemaName}`, {
          docs: [actualSchema.fields],
        }),
        'editManyDocuments'
      )
    )
  );

  routesArray.push(
    constructRoute(
      new ConduitRoute(
        {
          path: `/${schemaName}/:id`,
          action: ConduitRouteActions.UPDATE,
          urlParams: {
            id: { type: TYPE.String, required: true },
          },
          queryParams: {
            updateProvidedOnly: TYPE.Boolean,
          },
          bodyParams: assignableFields,
          middlewares: actualSchema.authentication ? ['authMiddleware'] : undefined,
        },
        new ConduitRouteReturnDefinition(`update${schemaName}`, actualSchema.fields),
        'editDocument'
      )
    )
  );

  routesArray.push(
    constructRoute(
      new ConduitRoute(
        {
          path: `/${schemaName}/:id`,
          action: ConduitRouteActions.DELETE,
          urlParams: {
            id: { type: TYPE.String, required: true },
          },
          middlewares: actualSchema.authentication ? ['authMiddleware'] : undefined,
        },
        new ConduitRouteReturnDefinition(`delete${schemaName}`, TYPE.String),
        'deleteDocument'
      )
    )
  );

  return routesArray;
}

export function sortAndConstructRoutes(schemas: { [name: string]: any }): any[] {
  let routesArray: any[] = [];
  let schemaSort = [];
  for (const k in schemas) {
    schemaSort.push(k);
  }
  schemaSort.sort((a: string, b: string) => {
    return compareFunction(schemas[a], schemas[b]);
  });
  schemaSort.forEach((r) => {
    routesArray = routesArray.concat(getOps(r, schemas[r]));
  });
  return routesArray;
}
