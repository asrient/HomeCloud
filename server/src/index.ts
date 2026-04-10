import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import 'dotenv/config'
import { setModules, ModulesType } from "shared/modules";
import { getExistingServiceController } from "shared/utils";
import { UITheme, ConnectionType } from "shared/types";
import { ConnectionInterface, NetService } from "shared/netService";
import { AccountService } from "shared/accountService";
import { ScreenService } from "shared/screenService";
import CryptoImpl from "nodeShared/cryptoImpl";
import NodeConfigStorage from "nodeShared/configStorage";
import TCPInterface from "nodeShared/tcpInterface";
import Discovery from "nodeShared/discovery";
import { NodePhotosService } from "nodeShared/photos/photosService";
import { HttpClient_, WebSocket_ } from "nodeShared/netCompat";
import NodeTerminalService from "nodeShared/terminal/terminalService";
import NodeWorkflowService from "nodeShared/workflow/workflowService";
import NodeAgentService from "nodeShared/agent/agentService";
import ServiceController from "shared/controller";
import ServerSystemService from "./systemService";
import ServerAppService from "./appService";
import ServerFilesService from "./filesService";
import ServerThumbService from "./thumbService";
import ServerWebcInterface from "./webcInterface";
import { getDeviceName, getOSType } from "nodeShared/deviceInfo";
import { deriveWsUrl } from "nodeShared/utils";
import crypto from "node:crypto";
import { env } from "node:process";
import { ServerConfigType } from "./types";

console.log(`
  ___ ___                       _________ .__                   .___
 /   |   \  ____   _____   ____ \_   ___ \|  |   ____  __ __  __| _/
/    ~    \/  _ \ /     \_/ __ \/    \  \/|  |  /  _ \|  |  \/ __ | 
\    Y    (  <_> )  Y Y  \  ___/\     \___|  |_(  <_> )  |  / /_/ | 
 \___|_  / \____/|__|_|  /\___  >\______  /____/\____/|____/\____ | 
       \/              \/     \/        \/                       \/ 

        Asrient's Studio  https://asrient.com

`);

const API_SERVER_URL = process.env.API_SERVER_URL || 'https://homecloudapi.asrient.com';
const WS_SERVER_URL = deriveWsUrl(API_SERVER_URL);

const TCP_PORT = process.env.TCP_PORT ? parseInt(process.env.TCP_PORT) : 7736;

const cryptoModule = new CryptoImpl();

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

async function getCreds(passphrase: string): Promise<{ privateKeyPem: string; publicKeyPem: string; accountId: string; secretKey: string }> {
    let raw: string;

    if (process.env.CREDS_PATH) {
        const credsPath = process.env.CREDS_PATH;
        if (!fs.existsSync(credsPath)) {
            throw new Error(`Credentials file not found: ${credsPath}`);
        }
        raw = fs.readFileSync(credsPath, 'utf-8');
    } else if (process.env.CREDS_BASE64) {
        raw = Buffer.from(process.env.CREDS_BASE64, 'base64').toString('utf-8');
    } else {
        throw new Error('Either CREDS_PATH or CREDS_BASE64 must be set.');
    }

    let parsed: { publicPem: string; encrytPrivatePem: { iv: string; payload: string }; salt: string; accountId: string };
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Failed to parse credentials JSON.');
    }

    if (!parsed.publicPem || !parsed.encrytPrivatePem || !parsed.accountId || !parsed.salt) {
        throw new Error('Credentials JSON must contain publicPem, encrytPrivatePem, salt, and accountId.');
    }

    const derivedKey = crypto.scryptSync(passphrase, Buffer.from(parsed.salt, 'hex'), 32);
    const iv = Buffer.from(parsed.encrytPrivatePem.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-ctr', derivedKey, iv);
    const privateKeyPem = Buffer.concat([decipher.update(Buffer.from(parsed.encrytPrivatePem.payload, 'hex')), decipher.final()]).toString('utf8');

    return {
        privateKeyPem,
        publicKeyPem: parsed.publicPem,
        accountId: parsed.accountId,
        secretKey: derivedKey.toString('hex'),
    };
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
    public override workflow = NodeWorkflowService.getInstance<NodeWorkflowService>();
    public override agent = NodeAgentService.getInstance<NodeAgentService>();

    async setup() {
        console.log("[ServiceController] Setting up services...");
        await this.account.init({
            httpClient: new HttpClient_(),
            webSocket: new WebSocket_(),
            accountId: modules.config.ACCOUNT_ID,
        });
        await this.app.init();
        await this.system.init();
        await this.files.init();
        await this.thumbnail.init();
        await this.photos.init();
        await this.screen.init();
        await this.terminal.init();
        await this.workflow.init();
        await this.agent.init();
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
        await this.workflow.start();
        await this.agent.start();
        console.log("[ServiceController] All services started.");
    }
}

async function getConfig(): Promise<ServerConfigType> {
    const dataDir = getDataDir();
    const cacheDir = getCacheDir();

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    const passphrase = env.PASSPHRASE;

    if (!passphrase) {
        throw new Error('PASSPHRASE is missing.');
    }

    const { privateKeyPem, publicKeyPem, accountId, secretKey } = await getCreds(passphrase);

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
        FINGERPRINT: cryptoModule.getFingerprintFromPem(publicKeyPem),
        APP_NAME: 'HomeCloud Server',
        UI_THEME: UITheme.Win11,
        SERVER_URL: API_SERVER_URL,
        WS_SERVER_URL: WS_SERVER_URL,
        OS: getOSType(),
        ACCOUNT_ID: accountId,
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
        serviceController.account.initiateLink()
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
