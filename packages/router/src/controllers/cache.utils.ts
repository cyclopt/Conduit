import { ConduitRoute } from '@quintessential-sft/conduit-sdk';
import { CacheScope } from 'apollo-cache-control';

const crypto = require('crypto');

export function createHashKey(path: string, context: any, params: any) {
  let hashKey: string = path + JSON.stringify(context) + JSON.stringify(params);
  hashKey = crypto.createHash('md5').update(hashKey).digest('hex');
  return hashKey;
}

export function extractCaching(
  route: ConduitRoute
): { caching: boolean; cacheAge?: number; scope?: string } {
  let caching: boolean = false;
  let cacheAge: any | undefined;
  let scope: string | undefined;
  if (route.input.cacheControl && route.input.cacheControl.indexOf(',') !== -1) {
    caching = true;
    let cache: string[] = route.input.cacheControl.split(',');
    scope = cache[0];
    cacheAge = cache[1].replace('max-age=', '');
    cacheAge = Number.parseInt(cacheAge);
  }
  return { caching, cacheAge, scope };
}

export function extractCachingGql(
  route: ConduitRoute
): { caching: boolean; cacheAge?: number; scope?: CacheScope } {
  let { caching, cacheAge, scope } = extractCaching(route);
  scope = scope === 'public' ? CacheScope.Public : CacheScope.Private;
  return { caching, cacheAge, scope: scope as CacheScope };
}
