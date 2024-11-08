import "dotenv/config";
import https from "https";
import fs from "fs";
import {
  setupEnvConfig,
  EnvType,
  envConfig,
  OptionalType,
  StorageType,
  initDb,
  ffmpegSetup,
  ServerAdaptor,
  ProfilesPolicy,
  serverAgentRouter,
  RequestOriginType,
  cryptoUtils,
  DiscoveryService,
  setupDbData,
} from "@homecloud/js-core";
import path from "path";
import os from "os";
import { DEFAULT_AGENT_PORT } from "packages/js-core/src/envConfig";

export default class App {
  server: ServerAdaptor | null = null;
  discoveryService: DiscoveryService | null = null;

  constructor() {
    this.setupConfig();
    ffmpegSetup();
  }

  getEnvVar(name: string, required: boolean = false): string | undefined {
    if (!process.env[name] && required) {
      console.error(`❌ ${name} env variable not set! Exiting...`);
      process.exit(1);
    }
    return process.env[name];
  }

  setupConfig() {
    const isDev = !(this.getEnvVar('NODE_ENV') === "production");
    const dataDir =
      this.getEnvVar('DATA_DIR') || isDev
        ? path.resolve(__dirname, "../../../DEV_SERVER_DATA")
        : path.join(os.homedir(), "/.homecloud");
    fs.mkdirSync(envConfig.DATA_DIR, { recursive: true });
    const serverBaseUrl =
      this.getEnvVar('SERVER_BASE_URL') || `http://localhost:${DEFAULT_AGENT_PORT}/`; // fix this
    const clientBaseUrl = this.getEnvVar('CLIENT_BASE_URL') || 'http://localhost:3000';

    if (!isDev && !this.getEnvVar('SECRET_KEY')) {
      console.error("❌ SECRET_KEY env variable not set on production!");
      process.exit(1);
    }

    const listProfiles = this.getEnvVar('LIST_PROFILES')
      ? this.getEnvVar('LIST_PROFILES') === "true"
      : false;
    const profilesPolicy: ProfilesPolicy = {
      passwordPolicy:
        (this.getEnvVar('PASSWORD_POLICY') as OptionalType) || OptionalType.Required,
      allowSignups: this.getEnvVar('ALLOW_SIGNUPS')
        ? this.getEnvVar('ALLOW_SIGNUPS') === "true"
        : true,
      listProfiles,
      syncPolicy:
        (this.getEnvVar('SYNC_POLICY') as OptionalType) || OptionalType.Required,
      adminIsDefault: this.getEnvVar('ADMIN_IS_DEFAULT')
        ? this.getEnvVar('ADMIN_IS_DEFAULT') === "true"
        : false,
      // Always require username if listProfiles is false.
      requireUsername:
        (this.getEnvVar('REQUIRE_USERNAME')
          ? this.getEnvVar('REQUIRE_USERNAME') === "true"
          : false) || !listProfiles,
      singleProfile: false,
    };

    const libraryDir = this.getEnvVar('LIBRARY_DIR') || path.join(os.homedir(), "Homecloud Server");
    fs.mkdirSync(libraryDir, { recursive: true });

    const publicKeyPem = this.getEnvVar('PUBLIC_KEY', true)!;
    const fingerprint = cryptoUtils.getFingerprintFromPem(publicKeyPem);

    setupEnvConfig({
      isDev,
      envType: EnvType.Server,
      dataDir,
      baseUrl: clientBaseUrl,
      apiBaseUrl: serverBaseUrl + "api/",
      webBuildDir: '',
      profilesPolicy,
      secretKey: this.getEnvVar('SECRET_KEY', true),
      disabledStorageTypes: [StorageType.Agent, StorageType.Dropbox, StorageType.Google, StorageType.WebDav], // All storage type except Local
      oneAuthServerUrl: this.getEnvVar('ONEAUTH_SERVER_URL') || null,
      oneAuthAppId: this.getEnvVar('ONEAUTH_APP_ID') || null,
      allowPrivateUrls: this.getEnvVar('ALLOW_PRIVATE_URLS') === "true",
      version: this.getEnvVar('npm_package_version'),
      deviceName: this.getEnvVar('DEVICE_NAME') || "Homecloud Server",
      libraryDir,
      privateKeyPem: this.getEnvVar('PRIVATE_KEY', true)!,
      publicKeyPem,
      fingerprint,
      certPem: this.getEnvVar('CERT', true)!,
      advertiseService: !(this.getEnvVar('ADVERTISE_SERVICE') === "false"),
    });
  }

  startServer() {
    this.server = new ServerAdaptor(serverAgentRouter, RequestOriginType.Agent);
    const httpsServer = https.createServer(
      {
        key: envConfig.PRIVATE_KEY_PEM,
        cert: envConfig.CERTIFICATE_PEM,
        rejectUnauthorized: false, // Disable automatic rejection. We are using self-signed cert
        requestCert: true, // Request client certificate
      },
      this.server.nativeHandler,
    );
    httpsServer.listen(envConfig.AGENT_PORT);

    console.log(`⚡️ HTTPS Server started on port: ${envConfig.AGENT_PORT}`);
    console.log(`🌎 Go ahead, visit ${envConfig.BASE_URL}`);
  }

  startWorkerHead() {
    this.discoveryService = DiscoveryService.setup();
    this.discoveryService.hello();
  }

  async setupDevice() {
    console.log('---SETTING UP HOMECLOUD SERVER ON THIS DEVICE---');
    const libraryDir = path.join(os.homedir(), "Homecloud Server", "admin");
    const defaultProfile = {
      name: "admin",
      username: null,
      password: this.getEnvVar('DEFAULT_PASSWORD') || '123456',
      libraryDir,
    };
    await setupDbData(defaultProfile);
  }

  static async init() {
    const app = new App();
    const dataDir = envConfig.DATA_DIR;
    const dbFilename = envConfig.IS_DEV ? "homecloud_dev.db" : "homecloud.db";
    const dbPath = path.join(dataDir, dbFilename);
    console.log(`🗄️ Database path: ${dbPath}`);
    if (!(await initDb(dbPath))) {
      console.error("❌ Failed to initialize database. Exiting...");
      process.exit(1);
    }
    return app;
  }
}
