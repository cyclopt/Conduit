import Config from "./modules/config";
import Admin from "./modules/admin";
import Router from "./modules/router";
import DatabaseProvider from "./modules/databaseProvider";
import InMemoryStore from "./modules/inMemoryStore";
import Email from "./modules/email";
import Storage from "./modules/storage";
import PushNotifications from './modules/pushNotifications';
import Authentication from './modules/authentication';
import * as grpc from "grpc";
import CMS from './modules/cms';

export default class ConduitGrpcSdk {

    private readonly serverUrl: string;
    private readonly _config: Config;
    private readonly _admin: Admin;
    private readonly _router: Router;
    private readonly _modules: any = {};
    private readonly _availableModules: any = {
        "in-memory-store": InMemoryStore,
        "database-provider": DatabaseProvider,
        "storage": Storage,
        "email": Email,
        "push-notifications": PushNotifications,
        "authentication": Authentication,
        "cms": CMS
    }
    private lastSearch: number = Date.now();

    constructor(serverUrl: string) {
        this.serverUrl = serverUrl;
        this._config = new Config(this.serverUrl);
        this._admin = new Admin(this.serverUrl);
        this._router = new Router(this.serverUrl);
        this.initializeModules().then(() => {});
        this.watchModules();
    }

    watchModules() {
        this.config.watchModules().on('module-registered', (modules: any) => {
            modules.forEach((m: any) => {
                if (!this._modules[m.moduleName] && this._availableModules[m.moduleName]) {
                    this._modules[m.moduleName] = new this._availableModules[m.moduleName](m.url);
                }
            })
        })
    }

    /**
     * Gets all the registered modules from the config and creates clients for them.
     * This will only work on known modules, since the primary usage for the sdk is internal
     */
    initializeModules() {
        return this._config
            .moduleList()
            .then(r => {
                this.lastSearch = Date.now();
                r.forEach(m => {
                    if (!this._modules[m.moduleName] && this._availableModules[m.moduleName]) {
                        this._modules[m.moduleName] = new this._availableModules[m.moduleName](m.url);
                    }
                })
                return "ok"
            })
            .catch(err => {
                if (err.code !== 5) {
                    console.error(err);
                }
            })
    }

    async waitForExistence(moduleName: string) {
        while (!this._modules[moduleName]) {
            await this.sleep(1000);
        }
        return true;
    }

    sleep(ms: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Used to refresh all modules to check for new registrations
     * @param force If true will check for new modules no matter the interval
     */
    async refreshModules(force?: boolean) {
        if (this.lastSearch < (Date.now() - 3000) || force) {
            return this.initializeModules();
        }
        return "ok";
    }

    get config(): Config {
        return this._config;
    }

    get admin(): Admin {
        return this._admin;
    }

    get router(): Router {
        return this._router;
    }

    get inMemoryStore(): InMemoryStore | null {
        if (this._modules["in-memory-store"]) {
            return this._modules["in-memory-store"];
        } else {
            console.warn("In memory store not up yet!")
            return null;
        }
    }

    get databaseProvider(): DatabaseProvider | null {
        if (this._modules["database-provider"]) {
            return this._modules["database-provider"];
        } else {
            console.warn("Database provider not up yet!")
            return null;
        }
    }

    get storage(): Storage | null {
        if (this._modules["storage"]) {
            return this._modules["storage"];
        } else {
            console.warn("Storage module not up yet!");
            return null;
        }
    }

    get emailProvider(): Email | null {
        if (this._modules["email"]) {
            return this._modules["email"];
        } else {
            console.warn("Email provider not up yet!")
            return null;
        }
    }

    get pushNotifications(): PushNotifications | null {
        if (this._modules["push-notifications"]) {
            return this._modules["push-notifications"];
        } else {
            console.warn("Push notifications module not up yet!");
            return null;
        }
    }

    get authentication(): Authentication | null {
        if (this._modules["authentication"]) {
            return this._modules["authentication"];
        } else {
            console.warn("Authentication module not up yet!");
            return null;
        }
    }

    get cms(): CMS | null {
        if (this._modules["cms"]) {
            return this._modules["cms"];
        } else {
            console.warn("Cms module not up yet!");
            return null;
        }
    }
}
export let grpcModule: any = grpc;
export * from "./interfaces";
export * from "./models";
export * from "./modules";
export * from "./helpers";
export * from './constants';
