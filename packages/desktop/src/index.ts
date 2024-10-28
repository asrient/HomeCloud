import "dotenv/config";
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
} from "@homecloud/js-core";
import path from "path";
import os from "os";
import {randomBytes} from "crypto";

const startText = `
------------------------------
|   ***HomeCloud Desktop***  |
------------------------------
`;

class App {
  webPort: number = 5000;
  agentPort: number = 5001;
  webServer: ServerAdaptor;
  agentServer: ServerAdaptor;

  constructor() {
    console.log(startText);
    this.setupConfig();
    ffmpegSetup();
    this.webServer = new ServerAdaptor(webRouter, RequestOriginType.Web);
    this.agentServer = new ServerAdaptor(desktopAgentRouter, RequestOriginType.Agent);
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
    const isDev = !(process.env.NODE_ENV === "production");
    const dataDir = isDev
        ? path.resolve(__dirname, "../../../DEV_DESKTOP_DATA")
        : path.join(os.homedir(), "/.homecloud"); // change it to default app data dir for each OS
    fs.mkdirSync(dataDir, { recursive: true });
    const webServerBaseUrl = `http://127.0.0.1:${this.webPort}/`;
    const clientBaseUrl = process.env.CLIENT_BASE_URL || 'http://localhost:3000/';

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
      desktopIsPackaged: process.env.DESKTOP_IS_PACKAGED === "true",
      envType: EnvType.Desktop,
      dataDir,
      baseUrl: clientBaseUrl,
      apiBaseUrl: webServerBaseUrl + "api/",
      webBuildDir: '', // fix this
      profilesPolicy,
      secretKey: this.createOrGetSecretKey(dataDir),
      oneAuthServerUrl: process.env.ONEAUTH_SERVER_URL || '',
      oneAuthAppId: process.env.ONEAUTH_APP_ID || '',
      userHomeDir: os.homedir(),
      allowPrivateUrls: true,
      deviceName,
      libraryDir,
      publicKeyPem,
      privateKeyPem,
      fingerprint,
      certPem,
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
    httpsServer.listen(this.agentPort);

    console.log(`⚡️ HTTPS Agent Server started on port: ${this.agentPort}`);
  }

  async start() {
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
    const dataDir = envConfig.DATA_DIR;
    const dbFilename = envConfig.IS_DEV ? "homecloud_dev.db" : "homecloud.db";
    const dbPath = path.join(dataDir, dbFilename);
    console.log(`🗄️ Database path: ${dbPath}`);
    if (!(await initDb(dbPath, defaultProfile))) {
      console.error("❌ Failed to initialize database. Exiting...");
      process.exit(1);
    }
    this.startWebServer();
    this.startAgentServer();
    console.log(`🌎 Go ahead, visit ${envConfig.BASE_URL}`);
  }
}

const app = new App();
app.start();
