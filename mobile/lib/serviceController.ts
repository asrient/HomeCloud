import ServiceController from "shared/controller";
import { ConnectionInterface, NetService } from "shared/netService";
import { AppService } from "shared/appService";
import TCPInterface from "./services/tcpInterface";
import { ConnectionType } from "shared/types";
import MobileSystemService from "./services/systemService";
import MobileThumbService from "./services/thumbService";
import MobileFilesService from "./services/filesService";
import { MobilePhotosService } from "./services/photosService";
import { AccountService } from "shared/accountService";
import { HttpClient_, WebSocket_ } from "./mobileCompat";
import MobileWebcInterface from "./services/webcInterface";

const TCP_PORT = 7736;

export default class MobileServiceController extends ServiceController {
    public override net = NetService.getInstance<NetService>();
    public override app = AppService.getInstance<AppService>();
    public override system = MobileSystemService.getInstance<MobileSystemService>();
    public override thumbnail = MobileThumbService.getInstance<MobileThumbService>();
    public override files = MobileFilesService.getInstance<MobileFilesService>();
    public override photos = MobilePhotosService.getInstance<MobilePhotosService>();
    public override account = AccountService.getInstance<AccountService>();

    async setup() {
        console.log("Setting up services...");
        await this.account.init({
            httpClient: new HttpClient_(),
            webSocket: new WebSocket_()
        });
        await this.app.init();
        await this.system.init();
        await this.files.init();
        await this.thumbnail.init();
        await this.photos.init();
        this.net.init(new Map<ConnectionType, ConnectionInterface>(
            [
                [ConnectionType.LOCAL, new TCPInterface(TCP_PORT)],
                [ConnectionType.WEB, new MobileWebcInterface()],
            ]
        ));

        await this.startAll();
        this.readyState = true;
        this.readyStateSignal.dispatch(this.readyState);
    }

    /**
     * Mark the user as onboarded and start any deferred services (e.g. networking).
     * On mobile, networking is deferred until after onboarding to avoid triggering
     * the iOS local network permission dialog prematurely.
     */
    async setUserOnboarded() {
        await this.app.setOnboarded(true);
        console.log("[MobileServiceController] User onboarded, starting deferred services...");
        // Start networking — no-ops if already running.
        await this.net.start();
    }

    private async startAll() {
        // Start services.
        console.log("Starting services...");
        await this.account.start();
        await this.app.start();
        await this.system.start();
        // Defer net.start() until after onboarding to avoid triggering
        // the iOS local network permission dialog before the user is ready.
        if (this.app.isOnboarded()) {
            await this.net.start();
        } else {
            console.log("[MobileServiceController] Skipping net.start() — user not onboarded yet.");
        }
        await this.files.start();
        await this.thumbnail.start();
        await this.photos.start();
        console.log("All services started.");
    }
}
