import { catchUnhandledErrors, crash } from "./crashHandler";
catchUnhandledErrors();

import gui from "gui";
import env from "./env";
import http from "http";
import https from "https";
import fs from "fs";
import {
  setupEnvConfig,
  envConfig,
  initDb,
  ServerAdaptor,
  desktopAgentRouter,
  webRouter,
  RequestOriginType,
  cryptoUtils,
  DiscoveryService,
  ThumbService,
} from "./core/index";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";
import NativeImplDesktop from "./nativeImpl";
import { getAppIntent, getDataDir, getUserLogDirectory, openWebApp } from "./utils";
import Tray from "./views/sysTray";
import { setupLogger, stopLogger } from "./logger";
import { setupNative } from "./core/native";
import { cleanupTmpDir } from "./core/utils/fileUtils";
import * as singleInstance from "./singleInstance";
import PhotosService from "./core/services/photos/photosService";

const startText = `
------------------------------
|      HomeCloud Desktop     |
------------------------------
`;

function startLogger() {
  let logDir = getUserLogDirectory(env.APP_NAME);
  if (!env.DESKTOP_IS_PACKAGED) {
    logDir = path.resolve(__dirname, "../");
  }
  let filename = "Run.log";
  if (env.NODE_ENV !== "production") {
    filename = "Debug.log";
  }
  const logFile = path.join(logDir, filename);
  setupLogger(logFile);
}

class App {
  webPort: number = 5000;
  webServer: ServerAdaptor;
  agentServer: ServerAdaptor;
  discoveryService: DiscoveryService;
  nativeImpl: NativeImplDesktop;
  tray: Tray;

  constructor() {
    startLogger();
    console.log(startText);
    this.setupConfig();
    this.webServer = new ServerAdaptor(webRouter, RequestOriginType.Web);
    this.agentServer = new ServerAdaptor(desktopAgentRouter, RequestOriginType.Agent);
    this.discoveryService = DiscoveryService.setup();
    this.nativeImpl = new NativeImplDesktop(this.quit.bind(this));
    setupNative(this.nativeImpl);
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
    await PhotosService.stop();
    await ThumbService.stop();
    this.tray.remove();
    singleInstance.clear();
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
      : path.resolve(__dirname, "../Debug");

    fs.mkdirSync(dataDir, { recursive: true });
    const webServerBaseUrl = `http://127.0.0.1:${this.webPort}/`;
    const clientBaseUrl = env.CLIENT_BASE_URL || 'http://localhost:3000/';
    const deviceName = os.hostname();

    const { privateKeyPem, publicKeyPem, certPem } = this.getOrGenerateKeys(dataDir);
    const fingerprint = cryptoUtils.getFingerprintFromPem(publicKeyPem);

    let userName = 'Homecloud User';
    try {
      userName = os.userInfo().username;
    } catch (e) {
      console.error("Warning: couldn't fetch system username.");
    }

    setupEnvConfig({
      appName: env.APP_NAME,
      isDev,
      desktopIsPackaged: env.DESKTOP_IS_PACKAGED,
      dataDir,
      baseUrl: clientBaseUrl,
      apiBaseUrl: webServerBaseUrl + "api/",
      secretKey: this.createOrGetSecretKey(dataDir),
      oneAuthServerUrl: env.ONEAUTH_SERVER_URL || '',
      oneAuthAppId: env.ONEAUTH_APP_ID || '',
      userHomeDir: os.homedir(),
      deviceName,
      publicKeyPem,
      privateKeyPem,
      fingerprint,
      certPem,
      advertiseService: true,
      version: env.VERSION,
      userName,
    });
  }

  startWebServer() {
    const httpServer = http.createServer(this.webServer.nativeHandler);
    // initSEPublisher(httpServer);
    httpServer.listen(this.webPort, '127.0.0.1');
    httpServer.listen({
      host: '127.0.0.1',
      port: this.webPort,
      reusePort: false,
      exclusive: true,
    });
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
    httpsServer.listen({
      port: envConfig.AGENT_PORT,
      reusePort: false,
      exclusive: true,
    });

    console.log(`⚡️ HTTPS Agent Server started on port: ${envConfig.AGENT_PORT}`);
  }

  async cleanFromLastRun() {
    try {
      await cleanupTmpDir();
    } catch (e) {
      console.error("Error cleaning tmp dir:", e);
    }
  }

  appIntent(action: string) {
    console.log("🔥 App intent:", action);
    if (this._isStarting) {
      console.log("🔥 App is sill starting, ignoring the app intent..");
      return;
    }
    if (action === 'activate') {
      openWebApp();
    }
  }

  private _isStarting = false;
  async start() {
    this._isStarting = true;
    singleInstance.listen(this.appIntent.bind(this));
    const dataDir = envConfig.DATA_DIR;
    const dbFilename = envConfig.IS_DEV ? "homecloud_dev.db" : "homecloud.db";
    const dbPath = path.join(dataDir, dbFilename);
    console.log(`🗄️ Database path: ${dbPath}`);
    if (!(await initDb(dbPath))) {
      console.error("❌ Failed to initialize database. Exiting...");
      crash("Failed to initialize database");
    }
    this.cleanFromLastRun();
    PhotosService.start();
    ThumbService.start();
    this.startWebServer();
    this.startAgentServer();
    this.tray.setStatus("running");
    this.discoveryService.hello();
    this.discoveryService.listen();
    this._isStarting = false;
    console.log("App params:", process.argv);
    console.log(`🌎 Go ahead, visit ${envConfig.BASE_URL}`);
    this.appIntent(getAppIntent());
  }
}

let _mainCalled = false;
// Main should be called only once.
function main() {
  if (_mainCalled) {
    throw new Error("Main called twice");
  }
  global.app = new App();
  global.app.start();
}

async function checkSingleInstanceAndStart() {
  if (await singleInstance.check(getAppIntent())) {
    gui.MessageLoop.quit();
    process.exit(0);
  }
  main();
}

// Basic checks and single instance setup.
(function () {
  if (!env.APP_NAME) {
    throw new Error("APP_NAME not set.");
  }
  if (!env.VERSION) {
    throw new Error("VERSION not set.");
  }
  singleInstance.setupSocketPath(env.APP_NAME);

  if (process.platform == 'darwin') {
    gui.lifetime.onReady = main;
  } else {
    if (singleInstance.quickCheckSync())
      checkSingleInstanceAndStart();
    else
      main();
  }
})();
