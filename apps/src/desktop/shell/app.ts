import { app, BrowserWindow, dialog } from "electron";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import AppProtocol from "./appProtocol";
import { TabbedAppWindow } from "./window";
import {
  setupEnvConfig,
  EnvType,
  envConfig,
  OptionalType,
  ProfilesPolicy,
} from "../../backend/envConfig";
import { handleServerEvent, ServerEvent } from "../../backend/serverEvent";
import { initDb } from "../../backend/db";
import ffmpegSetup from "../../backend/ffmpeg";

const isDev = process.env.NODE_ENV === "development";

export default class App {
  tabbedWindows: TabbedAppWindow[] = [];
  appProtocol: AppProtocol;

  constructor() {
    // Handle creating/removing shortcuts on Windows when installing/uninstalling.
    if (require("electron-squirrel-startup")) {
      app.quit();
    }
    this.setupConfig();
    ffmpegSetup();
    app.on("activate", this.appActivated);
    app.on("window-all-closed", this.allWindowsClosed);
    app.on("ready", this.appReady);
    app.on('open-url', (_e, url) => this.handleOpenUrl(url));
    app.on("second-instance", (_e, argv, workingDirectory) => this.handleSecondInstance(argv, workingDirectory));
    handleServerEvent(this.handleServerEvent);
    this.appProtocol = new AppProtocol();
  }

  checkMode() {
    if (isDev && app.isPackaged) {
      console.log("🚨 Electron app is packed but NODE_ENV=development.");
      dialog.showMessageBox({
        type: "warning",
        message: "Development Mode",
        detail: "This version of HomeCloud is meant for development and testing. This is not an official release. Please download the latest public release from the website.",
        buttons: ["OK"],
      })
    }
  }

  handleOpenUrl = (url: string | null) => {
    console.log("Opening deep link:", url);
    if (this.tabbedWindows.length === 0) {
      this.createTabbedWindow();
    }
    const window = this.tabbedWindows[this.tabbedWindows.length - 1];
    if (window.win.isMinimized()) {
      window.win.restore();
    }
    window.win.focus();
    window.createNewTab(url);
  }

  handleSecondInstance = (argv: string[], _workingDirectory: string) => {
    const url = argv.pop();
    this.handleOpenUrl(url || null);
  }

  handleServerEvent = async (event: ServerEvent) => {
    console.log("handleServerEvent", event);
    // todo: check profileId as well
    const { type, data } = event;
    this.tabbedWindows.forEach((w) => {
      w.pushServerEvent(type, data);
    });
  };

  createOrGetSecretKey() {
    const secretKeyPath = path.join(app.getPath("userData"), "secret.key");
    if (!fs.existsSync(secretKeyPath)) {
      console.log("😼 Secret key not found. Creating a new one..");
      const secretKey = crypto.randomBytes(20).toString("hex");
      fs.writeFileSync(secretKeyPath, secretKey);
      console.log("✅ Secret key written to file:", secretKeyPath);
      return secretKey;
    }
    return fs.readFileSync(secretKeyPath).toString();
  }

  setupConfig() {
    const profilesPolicy: ProfilesPolicy = {
      passwordPolicy: OptionalType.Optional,
      allowSignups: true,
      listProfiles: true,
      syncPolicy: OptionalType.Optional,
      adminIsDefault: true,
      requireUsername: false,
    };
    let userHomeDir = undefined;
    try {
      userHomeDir = app.getPath('home');
    } catch (e) {
      console.error("Failed to get home dir:", e);
    }
    setupEnvConfig({
      isDev,
      desktopIsPackaged: app.isPackaged,
      envType: EnvType.Desktop,
      dataDir: app.getPath("userData"),
      baseUrl: isDev && process.env.DEV_WEB_URL ? process.env.DEV_WEB_URL : AppProtocol.BUNDLE_BASE_URL,
      apiBaseUrl: AppProtocol.API_BASE_URL,
      webBuildDir: path.join(app.getAppPath(), "bin/web"),
      profilesPolicy,
      secretKey: this.createOrGetSecretKey(),
      oneAuthServerUrl: process.env.ONEAUTH_SERVER_URL || '',
      oneAuthAppId: process.env.ONEAUTH_APP_ID || '',
      userHomeDir,
      allowPrivateUrls: true,
      version: app.getVersion(),
    });
  }

  createTabbedWindow() {
    const win = new TabbedAppWindow();
    this.tabbedWindows.push(win);
  }

  connectDb = async () => {
    const dataDir = envConfig.DATA_DIR;
    const dbFilename = envConfig.IS_DEV ? "homecloud_dev.db" : "homecloud.db";
    const dbPath = path.join(dataDir, dbFilename);
    if (!(await initDb("sqlite", dbPath))) {
      console.error("❌ Failed to initialize database.");
      return false;
    }
    return true;
  };

  appReady = async () => {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    if (!(await this.connectDb())) {
      app.quit();
      return;
    }
    this.appProtocol.register();
    this.createTabbedWindow();
    this.checkMode();
  };

  appActivated = () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      this.createTabbedWindow();
    }
  };

  allWindowsClosed = () => {
    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    if (process.platform !== "darwin") {
      app.quit();
    }
  };
}
