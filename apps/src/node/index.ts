import "dotenv/config";
import http from "http";
import https from "https";
import ServerAdaptor from "./serverAdaptor";
import fs from "fs";
import {
  setupEnvConfig,
  EnvType,
  envConfig,
  OptionalType,
  StorageType,
} from "../backend/envConfig";
import path from "path";
import os from "os";
import { initDb } from "../backend/db";
import ffmpegSetup from "../backend/ffmpeg";
import { initSEPublisher } from "./serverEventPublisher";

const startText = `\n
██╗░░██╗░█████╗░███╗░░░███╗███████╗░█████╗░██╗░░░░░░█████╗░██╗░░░██╗██████╗░
██║░░██║██╔══██╗████╗░████║██╔════╝██╔══██╗██║░░░░░██╔══██╗██║░░░██║██╔══██╗
███████║██║░░██║██╔████╔██║█████╗░░██║░░╚═╝██║░░░░░██║░░██║██║░░░██║██║░░██║
██╔══██║██║░░██║██║╚██╔╝██║██╔══╝░░██║░░██╗██║░░░░░██║░░██║██║░░░██║██║░░██║
██║░░██║╚█████╔╝██║░╚═╝░██║███████╗╚█████╔╝███████╗╚█████╔╝╚██████╔╝██████╔╝
╚═╝░░╚═╝░╚════╝░╚═╝░░░░░╚═╝╚══════╝░╚════╝░╚══════╝░╚════╝░░╚═════╝░╚═════╝░
\n
🎨 Art credit: https://fsymbols.com/generators/carty/
🐱 Starting HomeCloud Server...`;

class AppServer {
  port: number = 5000;
  sslPort: number = 5001;
  server: ServerAdaptor;

  constructor() {
    console.log(startText);
    this.setupConfig();
    ffmpegSetup();
    this.server = new ServerAdaptor();
  }

  setupConfig() {
    const isDev = process.env.NODE_ENV === "development";
    const dataDir =
      process.env.DATA_DIR || isDev
        ? path.resolve(__dirname, "../nodeData")
        : path.join(os.homedir(), "/.homecloud");
    this.port = parseInt(process.env.PORT || "5000");
    this.sslPort = parseInt(process.env.PORT || "5001");
    const serverBaseUrl =
      process.env.SERVER_BASE_URL || `http://localhost:${this.port}/`;
    const clientBaseUrl = process.env.CLIENT_BASE_URL || serverBaseUrl;

    if (!isDev && !process.env.SECRET_KEY) {
      console.error("❌ SECRET_KEY env variable not set on production!");
      process.exit(1);
    }

    const listProfiles = process.env.LIST_PROFILES
      ? process.env.LIST_PROFILES === "true"
      : false;
    const profilesPolicy = {
      passwordPolicy:
        (process.env.PASSWORD_POLICY as OptionalType) || OptionalType.Required,
      allowSignups: process.env.ALLOW_SIGNUPS
        ? process.env.ALLOW_SIGNUPS === "true"
        : true,
      listProfiles,
      syncPolicy:
        (process.env.SYNC_POLICY as OptionalType) || OptionalType.Required,
      adminIsDefault: process.env.ADMIN_IS_DEFAULT
        ? process.env.ADMIN_IS_DEFAULT === "true"
        : false,
      // Always require username if listProfiles is false.
      requireUsername:
        (process.env.REQUIRE_USERNAME
          ? process.env.REQUIRE_USERNAME === "true"
          : false) || !listProfiles,
    };

    const disabledStorageTypes: StorageType[] = process.env
      .DISABLED_STORAGE_TYPES
      ? process.env.DISABLED_STORAGE_TYPES.split(",").map(
          (t) => t.trim() as StorageType,
        )
      : [];

    setupEnvConfig({
      isDev,
      envType: EnvType.Server,
      dataDir,
      baseUrl: clientBaseUrl,
      apiBaseUrl: serverBaseUrl + "api/",
      webBuildDir: path.join(__dirname, "../web"),
      profilesPolicy,
      secretKey: process.env.SECRET_KEY || "secret",
      disabledStorageTypes,
      oneAuthServerUrl: process.env.ONEAUTH_SERVER_URL || null,
      oneAuthAppId: process.env.ONEAUTH_APP_ID || null,
    });
  }

  startServer() {
    const httpServer = http.createServer(this.server.nativeHandler);
    initSEPublisher(httpServer);
    httpServer.listen(this.port);

    console.log(`⚡️ HTTP Server started on port: ${this.port}`);

    if (
      process.env.SSL !== "true" ||
      !process.env.SSL_KEY_PATH ||
      !process.env.SSL_CERT_PATH
    ) {
      return;
    }
    const httpsServer = https.createServer(
      {
        key: fs.readFileSync(process.env.SSL_KEY_PATH || ""),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH || ""),
      },
      this.server.nativeHandler,
    );
    initSEPublisher(httpsServer);
    httpsServer.listen(this.sslPort);

    console.log(`⚡️ HTTPS Server started on port: ${this.sslPort}`);
  }

  async start() {
    if (!process.env.DB_URL || !(await initDb("mysql", process.env.DB_URL))) {
      if (!process.env.DB_URL) {
        console.error("❗️ DB_URL env variable not set!");
      }
      console.error("❌ Failed to initialize database. Exiting...");
      process.exit(1);
    }
    this.startServer();
    console.log(`🌎 Go ahead, visit ${envConfig.BASE_URL}`);
  }
}

const appServer = new AppServer();
appServer.start();
