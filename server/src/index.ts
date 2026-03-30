import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import { setModules, ModulesType } from "shared/modules.js";
import { getExistingServiceController } from "shared/utils.js";
import { AppConfigType, OSType, UITheme, ConnectionType } from "shared/types.js";
import { ConnectionInterface, NetService } from "shared/netService.js";
import { AccountService } from "shared/accountService.js";
import { ScreenService } from "shared/screenService.js";
import CryptoImpl from "nodeShared/cryptoImpl.js";
import NodeConfigStorage from "nodeShared/configStorage.js";
import TCPInterface from "nodeShared/tcpInterface.js";
import Discovery from "nodeShared/discovery.js";
import { NodePhotosService } from "nodeShared/photos/photosService.js";
import { HttpClient_, WebSocket_ } from "nodeShared/netCompat.js";
import NodeTerminalService from "nodeShared/terminal/terminalService.js";
import ServiceController from "shared/controller.js";
import ServerSystemService from "./systemService.js";
import ServerAppService from "./appService.js";
import ServerFilesService from "./filesService.js";
import ServerThumbService from "./thumbService.js";
import ServerWebcInterface from "./webcInterface.js";
import { runSetupWizard } from "./setup.js";

require('dotenv').config();

console.log(`
  ___ ___                       _________ .__                   .___
 /   |   \  ____   _____   ____ \_   ___ \|  |   ____  __ __  __| _/
/    ~    \/  _ \ /     \_/ __ \/    \  \/|  |  /  _ \|  |  \/ __ | 
\    Y    (  <_> )  Y Y  \  ___/\     \___|  |_(  <_> )  |  / /_/ | 
 \___|_  / \____/|__|_|  /\___  >\______  /____/\____/|____/\____ | 
       \/              \/     \/        \/                       \/ 

        Asrient's Studio  https://asrient.com

`);

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';
const WS_SERVER_URL = deriveWsUrl(SERVER_URL);

function deriveWsUrl(serverUrl: string): string {
    const isSecure = serverUrl.startsWith('https://');
    const url = serverUrl.replace(/^https?:\/\//, isSecure ? 'wss://' : 'ws://');
    console.log(`Derived WS_SERVER_URL: ${url} from SERVER_URL: ${serverUrl}`);
    return url;
}

const TCP_PORT = 7736;

const cryptoModule = new CryptoImpl();

/**
 * Parse a hostname to make it more presentable.
 */
function parseHostname(hostname: string): string {
    let name = hostname;
    name = name.replace(/\.local$/, '');
    name = name.replace(/-\d+$/, '');
    name = name.replace(/-/g, ' ');
    return name.trim();
}

function getDeviceName(): string {
    if (process.env.DEVICE_NAME) {
        return process.env.DEVICE_NAME;
    }

    if (process.platform === 'darwin') {
        return parseHostname(os.hostname());
    }
    return os.hostname();
}

function getDataDir(): string {
    if (process.env.HC_DATA_DIR) {
        return process.env.HC_DATA_DIR;
    }
    const home = os.homedir();
    return path.join(home, '.hcServerData');
}

function getCacheDir(): string {
    if (process.env.HC_CACHE_DIR) {
        return process.env.HC_CACHE_DIR;
    }
    return path.join(os.tmpdir(), 'hcServerCache');
}

/**
 * Get or generate keys — stored as plain PEM files (no safeStorage on server).
 */
async function getOrGenerateKeys(dataDir: string) {
    const privateKeyPath = path.join(dataDir, "private.pem.key");
    const publicKeyPath = path.join(dataDir, "public.pem.key");
    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
        console.log("[Server] Key pair not found. Generating a new one.");
        const { privateKey, publicKey } = await cryptoModule.generateKeyPair();
        fs.mkdirSync(path.dirname(privateKeyPath), { recursive: true });
        fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
        fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
        console.log("[Server] Key pair generated.");
        return { privateKeyPem: privateKey, publicKeyPem: publicKey };
    }
    const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
    return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

function createOrGetSecretKey(dataDir: string): string {
    const secretKeyPath = path.join(dataDir, "secret.key");
    if (!fs.existsSync(secretKeyPath)) {
        console.log("[Server] Secret key not found. Creating a new one.");
        const secretKey = cryptoModule.generateRandomKey();
        fs.mkdirSync(path.dirname(secretKeyPath), { recursive: true });
        fs.writeFileSync(secretKeyPath, secretKey, { mode: 0o600 });
        console.log("[Server] Secret key created.");
        return secretKey;
    }
    return fs.readFileSync(secretKeyPath, 'utf-8').trim();
}

class ServerServiceController extends ServiceController {
    public override net = NetService.getInstance<NetService>();
    public override app = ServerAppService.getInstance<ServerAppService>();
    public override account = AccountService.getInstance<AccountService>();
    public override system = ServerSystemService.getInstance<ServerSystemService>();
    public override thumbnail = ServerThumbService.getInstance<ServerThumbService>();
    public override files = ServerFilesService.getInstance<ServerFilesService>();
    public override photos = NodePhotosService.getInstance<NodePhotosService>();
    public override screen = ScreenService.getInstance<ScreenService>();
    public override terminal = NodeTerminalService.getInstance<NodeTerminalService>();

    async setup() {
        console.log("[ServiceController] Setting up services...");
        await this.account.init({
            httpClient: new HttpClient_(),
            webSocket: new WebSocket_()
        });
        await this.app.init();
        await this.system.init();
        await this.files.init();
        await this.thumbnail.init();
        await this.photos.init();
        await this.screen.init();
        await this.terminal.init();
        this.net.init(new Map<ConnectionType, ConnectionInterface>(
            [
                [ConnectionType.LOCAL, new TCPInterface(TCP_PORT, new Discovery(TCP_PORT))],
                [ConnectionType.WEB, new ServerWebcInterface()]
            ]
        ));
        console.log("[ServiceController] All services initialized.");
        await this.startAll();
        this.readyState = true;
        this.readyStateSignal.dispatch(this.readyState);
        console.log("[ServiceController] Ready.");
    }

    private async startAll() {
        console.log("[ServiceController] Starting services...");
        await this.account.start();
        await this.app.start();
        await this.system.start();
        await this.net.start();
        await this.files.start();
        await this.thumbnail.start();
        await this.photos.start();
        await this.screen.start();
        console.log("[ServiceController] All services started.");
    }
}

async function getConfig(): Promise<AppConfigType> {
    const dataDir = getDataDir();
    const cacheDir = getCacheDir();

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const { privateKeyPem, publicKeyPem } = await getOrGenerateKeys(dataDir);
    const fingerprint = cryptoModule.getFingerprintFromPem(publicKeyPem);
    const secretKey = createOrGetSecretKey(dataDir);

    const osType = process.platform === 'darwin' ? OSType.MacOS
        : process.platform === 'win32' ? OSType.Windows
            : OSType.Linux;

    return {
        DATA_DIR: dataDir,
        CACHE_DIR: cacheDir,
        IS_DEV: process.env.NODE_ENV === 'development',
        IS_STORE_DISTRIBUTION: false,
        SECRET_KEY: secretKey,
        VERSION: process.env.npm_package_version || '0.0.1',
        DEVICE_NAME: getDeviceName(),
        PUBLIC_KEY_PEM: publicKeyPem,
        PRIVATE_KEY_PEM: privateKeyPem,
        FINGERPRINT: fingerprint,
        APP_NAME: 'HomeCloud Server',
        UI_THEME: UITheme.Win11,
        SERVER_URL: SERVER_URL,
        WS_SERVER_URL: WS_SERVER_URL,
        OS: osType,
    };
}

async function main() {
    console.log('[Server] Starting HomeCloud Server...');
    console.log(`[Server] Node: ${process.versions.node} | Platform: ${process.platform} ${process.arch}`);

    const config = await getConfig();

    const mod: ModulesType = {
        crypto: cryptoModule,
        config,
        ServiceController: ServerServiceController,
        ConfigStorage: NodeConfigStorage,
        getLocalServiceController: () => ServerServiceController.getLocalInstance<ServerServiceController>(),
        getRemoteServiceController: async (fingerprint: string) => {
            return ServerServiceController.getRemoteInstance(fingerprint);
        },
        getExistingServiceController,
    };
    setModules(mod, global);

    const serviceController = ServerServiceController.getLocalInstance<ServerServiceController>();
    await serviceController.setup();

    // Check if account is linked
    const isLinked = serviceController.account.isLinked();
    if (!isLinked) {
        const authToken = process.env.HOMECLOUD_AUTH_TOKEN;
        if (authToken) {
            console.log('[Server] Auth token found in environment. Attempting setup...');
            try {
                // Use the standard link flow with token
                console.log('[Server] Token-based setup is not yet implemented. Please use interactive setup.');
                await runSetupWizard();
            } catch (error) {
                console.error('[Server] Token setup failed:', error);
                process.exit(1);
            }
        } else if (process.stdin.isTTY) {
            await runSetupWizard();
        } else {
            console.log('[Server] No account linked. Run interactively to set up, or provide HOMECLOUD_AUTH_TOKEN.');
        }
    }

    console.log('[Server] HomeCloud Server is running.');
    console.log(`[Server] Device: ${config.DEVICE_NAME}`);
    console.log(`[Server] Fingerprint: ${config.FINGERPRINT}`);
    console.log(`[Server] Data dir: ${config.DATA_DIR}`);

    // Graceful shutdown handlers
    const shutdown = async () => {
        console.log('\n[Server] Shutting down...');
        try {
            await serviceController.net.stop();
        } catch (e) {
            console.error('[Server] Error during shutdown:', e);
        }
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    console.error('[Server] Fatal error:', error);
    process.exit(1);
});
