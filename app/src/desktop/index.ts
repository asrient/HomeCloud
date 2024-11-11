import { catchUnhandledErrors, crash } from "./crashHandler";
catchUnhandledErrors();

import env from "./env";
import http from "http";
import https from "https";
import fs from "fs";
import {
  setupEnvConfig,
  EnvType,
  envConfig,
  OptionalType,
  initDb,
  ffmpegSetup,
  ServerAdaptor,
  ProfilesPolicy,
  desktopAgentRouter,
  webRouter,
  RequestOriginType,
  cryptoUtils,
  DiscoveryService,
  setupDbData,
} from "../core/index";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";
import NativeImplDesktop from "./nativeImpl";
import { getDataDir, getUserLogDirectory } from "./utils";
import Tray from "./views/sysTray";
import { setupLogger, stopLogger } from "./logger";

(function () {
  if (!env.APP_NAME) {
    throw new Error("APP_NAME not set.");
  }
  let logDir = getUserLogDirectory(env.APP_NAME);
  if (!env.DESKTOP_IS_PACKAGED) {
    logDir = path.resolve(__dirname, "../../");
  }
  let filename = "Run.log";
  if (env.NODE_ENV !== "production") {
    filename = "Debug.log";
  }
  const logFile = path.join(logDir, filename);
  setupLogger(logFile);
})();

const startText = `
------------------------------
|   ***HomeCloud Desktop***  |
------------------------------
`;

class App {
  webPort: number = 5000;
  webServer: ServerAdaptor;
  agentServer: ServerAdaptor;
  discoveryService: DiscoveryService;
  nativeImpl: NativeImplDesktop;
  tray: Tray;

  constructor() {
    console.log(startText);
    this.setupConfig();
    ffmpegSetup();
    this.webServer = new ServerAdaptor(webRouter, RequestOriginType.Web);
    this.agentServer = new ServerAdaptor(desktopAgentRouter, RequestOriginType.Agent);
    this.discoveryService = DiscoveryService.setup();
    this.nativeImpl = new NativeImplDesktop(this.quit.bind(this));
    this.tray = new Tray(this.quit.bind(this));
  }

  private _appIsQuitting = false;

  async quit() {
    if (this._appIsQuitting) {
      return;
    }
    this._appIsQuitting = true;
    console.log("👋 Quitting app gracefully..");
    await this.discoveryService.goodbye();
    this.tray.remove();
    console.log("👋 Goodbye!");
    await stopLogger();
    process.exit(0);
  }

  createOrGetSecretKey(dataDir: string) {
    const secretKeyPath = path.join(dataDir, "secret.key");
    if (!fs.existsSync(secretKeyPath)) {
      console.log("😼 Secret key not found. Creating a new one..");
      const secretKey = randomBytes(20).toString("hex");
      fs.writeFileSync(secretKeyPath, secretKey);
      console.log("✅ Secret key written to file:", secretKeyPath);
      return secretKey;
    }
    return fs.readFileSync(secretKeyPath).toString();
  }

  getOrGenerateKeys(dataDir: string) {
    const privateKeyPath = path.join(dataDir, "private.pem"); // todo: save it in keytar instead of file
    const publicKeyPath = path.join(dataDir, "public.pem");
    const certPath = path.join(dataDir, "cert.pem");
    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath) || !fs.existsSync(certPath)) {
      console.log("🔑 Key pair not found. Generating a new one..");
      const { privateKey, publicKey, cert } = cryptoUtils.generateKeyPair();
      fs.writeFileSync(privateKeyPath, privateKey);
      fs.writeFileSync(publicKeyPath, publicKey);
      fs.writeFileSync(certPath, cert);
      console.log("✅ Key pair written to files:", privateKeyPath, publicKeyPath, certPath);
      return { privateKeyPem: privateKey, publicKeyPem: publicKey, certPem: cert };
    }
    return {
      privateKeyPem: fs.readFileSync(privateKeyPath).toString(),
      publicKeyPem: fs.readFileSync(publicKeyPath).toString(),
      certPem: fs.readFileSync(certPath).toString(),
    };
  }

  setupConfig() {
    const isDev = !(env.NODE_ENV === "production");
    const dataDir = env.DESKTOP_IS_PACKAGED
      ? getDataDir(env.APP_NAME)
      : path.resolve(__dirname, "../../Debug/Desktop");

    fs.mkdirSync(dataDir, { recursive: true });
    const webServerBaseUrl = `http://127.0.0.1:${this.webPort}/`;
    const clientBaseUrl = env.CLIENT_BASE_URL || 'http://localhost:3000/';

    const profilesPolicy: ProfilesPolicy = {
      passwordPolicy: OptionalType.Optional,
      allowSignups: false,
      listProfiles: true,
      syncPolicy: OptionalType.Optional,
      adminIsDefault: true,
      requireUsername: false,
      singleProfile: true,
    };

    const deviceName = os.hostname();
    const libraryDir = path.join(os.homedir(), "Homecloud Library"); // todo: make it configurable
    fs.mkdirSync(libraryDir, { recursive: true });

    const { privateKeyPem, publicKeyPem, certPem } = this.getOrGenerateKeys(dataDir);
    const fingerprint = cryptoUtils.getFingerprintFromPem(publicKeyPem);

    setupEnvConfig({
      isDev,
      desktopIsPackaged: env.DESKTOP_IS_PACKAGED,
      envType: EnvType.Desktop,
      dataDir,
      baseUrl: clientBaseUrl,
      apiBaseUrl: webServerBaseUrl + "api/",
      webBuildDir: '', // fix this
      profilesPolicy,
      secretKey: this.createOrGetSecretKey(dataDir),
      oneAuthServerUrl: env.ONEAUTH_SERVER_URL || '',
      oneAuthAppId: env.ONEAUTH_APP_ID || '',
      userHomeDir: os.homedir(),
      allowPrivateUrls: true,
      deviceName,
      libraryDir,
      publicKeyPem,
      privateKeyPem,
      fingerprint,
      certPem,
      advertiseService: true,
      version: env.VERSION,
    });
  }

  startWebServer() {
    const httpServer = http.createServer(this.webServer.nativeHandler);
    // initSEPublisher(httpServer);
    httpServer.listen(this.webPort, '127.0.0.1');

    console.log(`⚡️ HTTP Web Server started on port: ${this.webPort}`);
  }

  startAgentServer() {
    const httpsServer = https.createServer(
      {
        key: envConfig.PRIVATE_KEY_PEM,
        cert: envConfig.CERTIFICATE_PEM,
        rejectUnauthorized: false, // Disable automatic rejection. We are using self-signed cert
        requestCert: true, // Request client certificate
      },
      this.agentServer.nativeHandler,
    );
    httpsServer.listen(envConfig.AGENT_PORT);

    console.log(`⚡️ HTTPS Agent Server started on port: ${envConfig.AGENT_PORT}`);
  }

  async start() {
    const dataDir = envConfig.DATA_DIR;
    const dbFilename = envConfig.IS_DEV ? "homecloud_dev.db" : "homecloud.db";
    const dbPath = path.join(dataDir, dbFilename);
    console.log(`🗄️ Database path: ${dbPath}`);
    if (!(await initDb(dbPath))) {
      console.error("❌ Failed to initialize database. Exiting...");
      crash("Failed to initialize database");
    }
    let profileName = 'Homecloud User';
    try {
      profileName = os.userInfo().username;
    } catch (e) {
      console.error("Warning: couldn't fetch system username.");
    }
    const defaultProfile = {
      name: profileName,
      username: null,
      password: null,
    };
    await setupDbData(defaultProfile);
    this.startWebServer();
    this.startAgentServer();
    this.tray.setStatus("running");
    this.discoveryService.hello();
    this.discoveryService.listen();
    console.log(`🌎 Go ahead, visit ${envConfig.BASE_URL}`);
  }
}

global.app = new App();
global.app.start();
