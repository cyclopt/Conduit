import { App } from './app';
import { ConduitApp } from './interfaces/ConduitApp';
import AdminModule from '@conduitplatform/conduit-admin';
import SecurityModule from '@conduitplatform/conduit-security';
import ConfigManager from '@conduitplatform/conduit-config';
import path from 'path';
import ConduitGrpcSdk from '@conduitplatform/conduit-grpc-sdk';
import { ConduitDefaultRouter } from '@conduitplatform/conduit-router';
import convict from './utils/config';
import { Server, ServerCredentials } from '@grpc/grpc-js';

let protoLoader = require('@grpc/proto-loader');

export class CoreBootstrapper {
  static bootstrap() {
    let primary: App;
    let _port = process.env.SERVICE_PORT || '55152';

    var server: Server = new Server({
      'grpc.max_receive_message_length': 1024 * 1024 * 100,
      'grpc.max_send_message_length': 1024 * 1024 * 100,
    });
    var packageDefinition = protoLoader.loadSync(
      path.resolve(__dirname, './core.proto'),
      {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      }
    );
    // NOTE: all core packages with grpc need to be created before grpc server start
    primary = new App();
    const app = primary.get();
    let _url = '0.0.0.0:' + _port;
    server.bindAsync(_url, ServerCredentials.createInsecure(), (err, port) => {
      _url = '0.0.0.0:' + port.toString();
      const grpcSdk = new ConduitGrpcSdk(_url, 'core');
      if (err) {
        console.error(err);
        process.exit(-1);
      }
      server.start();
      console.log('grpc server listening on:', _url);
      let manager = new ConfigManager(
        grpcSdk,
        app.conduit,
        server,
        packageDefinition,
        (url: string) => {
          primary?.initialize();
          CoreBootstrapper.bootstrapSdkComponents(grpcSdk, app).catch(console.log);
        }
      );

      app.conduit.registerConfigManager(manager);
      app.conduit.registerAdmin(
        new AdminModule(app, grpcSdk, app.conduit, packageDefinition, server)
      );
      app.conduit.registerRouter(
        new ConduitDefaultRouter(app, grpcSdk, packageDefinition, server)
      );
    });
    return app;
  }

  private static async bootstrapSdkComponents(grpcSdk: ConduitGrpcSdk, app: ConduitApp) {
    await app.conduit.getConfigManager().registerAppConfig();
    let error;
    app.conduit
      .getConfigManager()
      .get('core')
      .catch((err: any) => (error = err));
    if (error) {
      await app.conduit
        .getConfigManager()
        .registerModulesConfig('core', convict.getProperties());
    } else {
      await app.conduit
        .getConfigManager()
        .addFieldsToModule('core', convict.getProperties());
    }

    app.conduit.getAdmin().initialize();
    app.conduit.getConfigManager().initConfigAdminRoutes();
    app.conduit.registerSecurity(new SecurityModule(app.conduit, grpcSdk));

    app.initialized = true;
  }
}
