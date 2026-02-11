import ServiceController from "shared/controller";
import { ConnectionInterface, NetService } from "shared/netService";
import TCPInterface from "./tcpInterface";
import { ConnectionType } from "shared/types";
import DesktopSystemService from "./system/systemService";
import DesktopThumbService from "./thumb/thumbService";
import DesktopFilesService from "./files/filesService";
import { DesktopPhotosService } from "./photos/photosService";
import { AccountService } from "shared/accountService";
import { HttpClient_, WebSocket_ } from "../desktopCompat";
import DesktopWebcInterface from "./webcInterface";
import DesktopAppService from "./appService";

const TCP_PORT = 7736;

export default class DesktopServiceController extends ServiceController {

    public override net = NetService.getInstance<NetService>();
    public override app = DesktopAppService.getInstance<DesktopAppService>();
    public override account = AccountService.getInstance<AccountService>();
    public override system = DesktopSystemService.getInstance<DesktopSystemService>();
    public override thumbnail = DesktopThumbService.getInstance<DesktopThumbService>();
    public override files = DesktopFilesService.getInstance<DesktopFilesService>();
    public override photos = DesktopPhotosService.getInstance<DesktopPhotosService>();

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
                [ConnectionType.WEB, new DesktopWebcInterface()]
            ]
        ));
        console.log("All services initialized.");
        await this.startAll();
        this.readyState = true;
        this.readyStateSignal.dispatch(this.readyState);
        console.log("ServiceController is ready.");
    }

    private async startAll() {
        // Start services.
        console.log("Starting services...");
        await this.account.start();
        await this.app.start();
        await this.system.start();
        await this.net.start();
        await this.files.start();
        await this.thumbnail.start();
        await this.photos.start();
        console.log("All services started.");
    }
}
