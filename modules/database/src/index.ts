import { DatabaseProvider } from './DatabaseProvider';
import ConduitGrpcSdk from '@quintessential-sft/conduit-grpc-sdk';
import process from 'process';

if (!process.env.CONDUIT_SERVER) {
  throw new Error('Conduit server URL not provided');
}
let grpcSdk = new ConduitGrpcSdk(process.env.CONDUIT_SERVER, 'database-provider');
let databaseProvider = new DatabaseProvider(grpcSdk);
databaseProvider
  .ensureIsRunning()
  .then(() => {
    let url = databaseProvider.url;
    if (process.env.REGISTER_NAME === 'true') {
      url = 'database-provider:' + url.split(':')[1];
    }
    grpcSdk.config
      .registerModule('database-provider', url)
      .then((r) => {
        databaseProvider.initBus();
      })
      .catch((err: any) => {
        console.error(err);
        process.exit(-1);
      });
  })
  .catch((err: any) => {
    console.error(err);
    process.exit(-1);
  });
