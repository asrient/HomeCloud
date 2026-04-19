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

// ── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
    const args: Record<string, string> = {};
    const aliases: Record<string, string> = {
        '-p': '--passphrase',
        '-c': '--creds',
        '-d': '--data-dir',
        '-n': '--name',
    };
    for (let i = 2; i < argv.length; i++) {
        let key = argv[i];
        if (aliases[key]) key = aliases[key];
        if (key.startsWith('--')) {
            const name = key.slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith('-')) {
                args[name] = next;
                i++;
            } else {
                args[name] = '';
            }
        }
    }
    return args;
}

const cliArgs = parseArgs(process.argv);

/** Returns the CLI arg if provided, otherwise falls back to the env var. */
function option(argName: string, envName: string): string | undefined {
    return cliArgs[argName] ?? env[envName] ?? undefined;
}

console.log(`
  ___ ___                       _________ .__                   .___
 /   |   \  ____   _____   ____ \_   ___ \|  |   ____  __ __  __| _/
/    ~    \/  _ \ /     \_/ __ \/    \  \/|  |  /  _ \|  |  \/ __ | 
\    Y    (  <_> )  Y Y  \  ___/\     \___|  |_(  <_> )  |  / /_/ | 
 \___|_  / \____/|__|_|  /\___  >\______  /____/\____/|____/\____ | 
       \/              \/     \/        \/                       \/ 

        Asrient's Studio  https://asrient.com

`);

const API_SERVER_URL = option('api-url', 'API_SERVER_URL') || 'https://homecloudapi.asrient.com';
const WS_SERVER_URL = deriveWsUrl(API_SERVER_URL);

const TCP_PORT = parseInt(option('port', 'TCP_PORT') || '7736');

const cryptoModule = new CryptoImpl();

function getDataDir(): string {
    return option('data-dir', 'HC_DATA_DIR') || path.join(os.homedir(), '.hcServerData');
}

function getCacheDir(): string {
    return option('cache-dir', 'HC_CACHE_DIR') || path.join(os.tmpdir(), 'hcServerCache');
}

async function getCreds(passphrase: string): Promise<{ privateKeyPem: string; publicKeyPem: string; accountId: string; secretKey: string }> {
    let raw: string;

    const credsPath = option('creds', 'CREDS_PATH');
    const credsBase64 = option('creds-base64', 'CREDS_BASE64');

    if (credsPath) {
        if (!fs.existsSync(credsPath)) {
            throw new Error(`Credentials file not found: ${credsPath}`);
        }
        raw = fs.readFileSync(credsPath, 'utf-8');
    } else if (credsBase64) {
        raw = Buffer.from(credsBase64, 'base64').toString('utf-8');
    } else {
        throw new Error('Credentials required: use --creds <path> or --creds-base64 <data> (env: CREDS_PATH or CREDS_BASE64)');
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

function getPackageVersion(): string {
    try {
        const pkgPath = path.join(__dirname, '..', 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg && typeof pkg.version === 'string' && pkg.version.length > 0) {
            return pkg.version;
        }
    } catch (err) {
        console.warn('[Server] Failed to read package.json version:', err);
    }
    return process.env.npm_package_version || '0.0.0';
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

    const passphrase = option('passphrase', 'PASSPHRASE');

    if (!passphrase) {
        throw new Error('Passphrase required: use --passphrase <value> or -p <value> (env: PASSPHRASE)');
    }

    const { privateKeyPem, publicKeyPem, accountId, secretKey } = await getCreds(passphrase);

    return {
        DATA_DIR: dataDir,
        CACHE_DIR: cacheDir,
        IS_DEV: process.env.NODE_ENV === 'development',
        IS_STORE_DISTRIBUTION: false,
        SECRET_KEY: secretKey,
        VERSION: getPackageVersion(),
        DEVICE_NAME: option('name', 'DEVICE_NAME') || getDeviceName(),
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
