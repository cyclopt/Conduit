import { Application, NextFunction, Request, Response } from 'express';
import {
  ConduitModel,
  ConduitRoute,
  ConduitRouteActions,
  ConduitRouteOptions,
  TYPE,
} from '@conduitplatform/conduit-commons';
import { GraphQlParser, ParseResult } from './GraphQlParser';
import { findPopulation } from './utils/TypeUtils';
import { GraphQLJSONObject } from 'graphql-type-json';
import { GraphQLScalarType, Kind } from 'graphql';
import 'apollo-cache-control';
import { createHashKey, extractCachingGql } from '../cache.utils';
import moment from 'moment';
import { processParams } from './utils/SimpleTypeParamUtils';
import { ConduitRouter } from '../Router';
import { errorHandler } from './utils/Request.utils';

const { parseResolveInfo } = require('graphql-parse-resolve-info');
const { ApolloServer } = require('apollo-server-express');

export class GraphQLController extends ConduitRouter {
  typeDefs!: string;
  types!: string;
  queries!: string;
  mutations!: string;
  resolvers: any;
  private _apollo?: any;
  private _relationTypes: string[] = [];
  private _scheduledTimeout: any = null;
  private _parser: GraphQlParser;

  constructor(readonly app: Application) {
    super(app);
    this.initialize();
    this._parser = new GraphQlParser();
  }

  refreshGQLServer() {
    const server = new ApolloServer({
      typeDefs: this.typeDefs,
      resolvers: this.resolvers,
      context: ({ req }: any) => {
        const context = (req as any).conduit || {};
        let headers: any = req.headers;
        return { context, headers };
      },
    });

    this._apollo = server.getMiddleware();
  }

  generateType(name: string, fields: ConduitModel | string) {
    if (this.typeDefs.includes('type ' + name + ' ')) {
      return;
    }
    const self = this;
    let parseResult: ParseResult = this._parser.extractTypes(name, fields, false);
    this.types += parseResult.typeString;
    parseResult.relationTypes.forEach((type: string) => {
      if (self._relationTypes.indexOf(type) === -1) {
        self._relationTypes.push(type);
      }
    });

    if (
      this.types.includes('JSONObject') &&
      this.types.indexOf('scalar JSONObject') === -1
    ) {
      this.types += '\n scalar JSONObject \n';
      this.resolvers['JSONObject'] = GraphQLJSONObject;
    }

    for (let resolveGroup in parseResult.parentResolve) {
      if (!parseResult.parentResolve.hasOwnProperty(resolveGroup)) continue;
      if (!self.resolvers[resolveGroup]) {
        self.resolvers[resolveGroup] = {};
      }
      for (let resolverFunction in parseResult.parentResolve[resolveGroup]) {
        if (!parseResult.parentResolve[resolveGroup].hasOwnProperty(resolverFunction))
          continue;
        if (!self.resolvers[resolveGroup][resolverFunction]) {
          self.resolvers[resolveGroup][resolverFunction] =
            parseResult.parentResolve[resolveGroup][resolverFunction];
        }
      }
    }
  }

  generateAction(input: ConduitRouteOptions, returnType: string) {
    // todo refine this, simply replacing : with empty is too dumb
    let cleanPath: string = input.path;
    while (cleanPath.indexOf('-') !== -1) {
      cleanPath = cleanPath.replace('-', '');
    }
    while (cleanPath.indexOf(':') !== -1) {
      cleanPath = cleanPath.replace(':', '');
    }
    let pathName: string[] = cleanPath.split('/');
    if (
      pathName[pathName.length - 1].length === 0 ||
      pathName[pathName.length - 1] === ''
    ) {
      pathName = pathName.slice(0, pathName.length - 1);
    } else {
      pathName = pathName.slice(0, pathName.length);
    }
    let uniqueName: string = '';
    pathName.forEach((r) => {
      uniqueName += r.slice(0, 1).toUpperCase() + r.slice(1);
    });
    let name = input.name ? input.name : input.action.toLowerCase() + uniqueName;

    let params = '';
    if (input.bodyParams || input.queryParams || input.urlParams) {
      if (input.bodyParams) {
        let parseResult: ParseResult = this._parser.extractTypes(
          name + 'Request',
          input.bodyParams,
          true
        );
        this.types += parseResult.typeString;
        params += (params.length > 1 ? ',' : '') + 'params' + ':';
        params += name + 'Request';
      }

      if (input.queryParams) {
        params = processParams(input.queryParams, params);
      }

      if (input.urlParams) {
        params = processParams(input.urlParams, params);
      }
      params = '(' + params + ')';
    }

    let description = '';
    if (input.description) {
      description = `""" ${input.description} """ `;
    }

    let finalName = description + name + params + ':' + returnType;
    if (input.action === ConduitRouteActions.GET && !this.queries.includes(finalName)) {
      this.queries += ' ' + finalName;
    } else if (
      input.action !== ConduitRouteActions.GET &&
      !this.mutations.includes(finalName)
    ) {
      this.mutations += ' ' + finalName;
    }
    return name;
  }

  generateQuerySchema() {
    if (this.queries.length > 1) {
      return 'type Query { ' + this.queries + ' }';
    }
    return '';
  }

  generateMutationSchema() {
    if (this.mutations.length > 1) {
      return 'type Mutation { ' + this.mutations + ' }';
    } else {
      return '';
    }
  }

  generateSchema() {
    this.typeDefs =
      this.types + ' ' + this.generateQuerySchema() + ' ' + this.generateMutationSchema();
  }

  shouldPopulate(args: any, info: any) {
    let resolveInfo = parseResolveInfo(info);
    let objs = resolveInfo.fieldsByTypeName;
    objs = objs[Object.keys(objs)[0]];
    let result = findPopulation(objs, this._relationTypes);
    if (result) {
      args['populate'] = result;
    }
    return args;
  }

  registerConduitRoute(route: ConduitRoute) {
    const key = `${route.input.action}-${route.input.path}`;
    const registered = this._registeredRoutes.has(key);
    this._registeredRoutes.set(key, route);
    if (registered) {
      this.refreshRouter();
    } else {
      this.addConduitRoute(route);
      this._scheduleTimeout();
    }
  }

  protected refreshRouter() {
    this.initialize();
    this._registeredRoutes.forEach((route) => {
      // we should probably implement some kind of caching for this
      // so it does not recalculate the types for the routes that have not changed
      // but it needs to be done carefully
      this.addConduitRoute(route);
    });
    this._scheduleTimeout();
  }

  private initialize() {
    this.resolvers = {
      Date: new GraphQLScalarType({
        name: 'Date',
        description: 'Date custom scalar type',
        parseValue(value) {
          return new Date(value); // value from the client
        },
        serialize(value) {
          return value; // value sent to the client
        },
        parseLiteral(ast) {
          if (ast.kind === Kind.INT) {
            return new Date(ast.value); // ast value is always in string format
          } else if (ast.kind === Kind.STRING) {
            return moment(ast.value).toDate();
          }
          return null;
        },
      }),
      Number: new GraphQLScalarType({
        name: 'Number',
        description: 'Number custom scalar type, is either int or float',
        parseValue(value) {
          // maybe wrong
          if (typeof value === 'string') {
            if (Number.isInteger(value)) {
              return Number.parseInt(value);
            } else if (!Number.isNaN(value)) {
              return Number.parseFloat(value);
            }
          } else {
            return value;
          }
        },
        serialize(value) {
          if (typeof value === 'string') {
            if (Number.isInteger(value)) {
              return Number.parseInt(value);
            } else if (!Number.isNaN(value)) {
              return Number.parseFloat(value);
            }
          } else {
            return value;
          }
        },
        parseLiteral(ast) {
          if (ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
            return ast.value;
          } else if (ast.kind == Kind.STRING) {
            if (Number.isInteger(ast.value)) {
              return Number.parseInt(ast.value);
            } else if (!Number.isNaN(ast.value)) {
              return Number.parseFloat(ast.value);
            }
          }
          return null;
        },
      }),
    };
    this.typeDefs = ` `;
    this.types = 'scalar Date\nscalar Number\n';
    this.queries = '';
    this.mutations = '';
    const self = this;

    this._expressRouter.use('/', (req: Request, res: Response, next: NextFunction) => {
      if (self._apollo) {
        self._apollo(req, res, next);
      } else {
        next();
      }
    });
  }

  private extractResult(returnTypeFields: String, result: any) {
    switch (returnTypeFields) {
      case TYPE.JSON:
        return JSON.parse(result);
      default:
        return result;
    }
  }

  private constructQuery(actionName: string, route: ConduitRoute) {
    if (!this.resolvers['Query']) {
      this.resolvers['Query'] = {};
    }
    const self = this;
    this.resolvers['Query'][actionName] = (
      parent: any,
      args: any,
      context: any,
      info: any
    ) => {
      let { caching, cacheAge, scope } = extractCachingGql(
        route,
        context.headers['Cache-Control']
      );
      if (caching) {
        info.cacheControl.setCacheHint({ maxAge: cacheAge, scope });
      }
      args = self.shouldPopulate(args, info);
      context.path = route.input.path;
      let hashKey: string;
      return self
        .checkMiddlewares(context, route.input.middlewares)
        .then((r: any) => {
          Object.assign(context.context, r);
          let params = Object.assign(args, args.params);
          delete params.params;
          if (caching) {
            hashKey = createHashKey(context.path, context.context, params);
          }
          if (caching) {
            return self
              .findInCache(hashKey)
              .then((r: any) => {
                if (r) {
                  return { fromCache: true, data: JSON.parse(r) };
                } else {
                  return route.executeRequest.bind(route)({ ...context, params });
                }
              })
              .catch(() => {
                return route.executeRequest.bind(route)({ ...context, params });
              });
          } else {
            return route.executeRequest.bind(route)({ ...context, params });
          }
        })
        .then((r: any) => {
          let result;
          if (r.fromCache) {
            return r.data;
          } else {
            result = r.result ? r.result : r;
          }

          if (r.result && !(typeof route.returnTypeFields === 'string')) {
            result = JSON.parse(result);
          } else {
            result = {
              result: self.extractResult(route.returnTypeFields as string, result),
            };
          }
          if (caching) {
            this.storeInCache(hashKey, result, cacheAge!);
          }

          return result;
        })
        .catch(errorHandler);
    };
  }

  private constructMutation(actionName: string, route: ConduitRoute) {
    if (!this.resolvers['Mutation']) {
      this.resolvers['Mutation'] = {};
    }
    const self = this;
    this.resolvers['Mutation'][actionName] = (
      parent: any,
      args: any,
      context: any,
      info: any
    ) => {
      args = self.shouldPopulate(args, info);
      context.path = route.input.path;
      return self
        .checkMiddlewares(context, route.input.middlewares)
        .then((r: any) => {
          Object.assign(context.context, r);
          let params = Object.assign(args, args.params);
          delete params.params;
          return route.executeRequest.bind(route)({ ...context, params: args });
        })
        .then((r) => {
          let result = r.result ? r.result : r;
          if (r.result && !(typeof route.returnTypeFields === 'string')) {
            result = JSON.parse(result);
          } else {
            result = {
              result: self.extractResult(route.returnTypeFields as string, result),
            };
          }
          return result;
        })
        .catch(errorHandler);
    };
  }

  private addConduitRoute(route: ConduitRoute) {
    this.generateType(route.returnTypeName, route.returnTypeFields);
    let actionName = this.generateAction(route.input, route.returnTypeName);
    this.generateSchema();

    if (route.input.action === ConduitRouteActions.GET) {
      this.constructQuery(actionName, route);
    } else {
      this.constructMutation(actionName, route);
    }
  }

  private _scheduleTimeout() {
    if (this._scheduledTimeout) {
      clearTimeout(this._scheduledTimeout);
      this._scheduledTimeout = null;
    }

    this._scheduledTimeout = setTimeout(() => {
      try {
        this.refreshGQLServer();
      } catch (err) {
        console.error(err);
      }
      this._scheduledTimeout = null;
    }, 3000);
  }
}
