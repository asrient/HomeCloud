import ServiceController from "shared/services/controller";
import { NetService } from "shared/services/netService";
import { AppService } from "shared/services/appService";
import TCPInterface from "./tcpInterface";
import { ConnectionType } from "shared/types";
import DesktopSystemService from "./system/systemService";
import DesktopThumbService from "./thumb/thumbService";
import DesktopFilesService from "./files/filesService";

const TCP_PORT = 7736;

export default class DesktopServiceController extends ServiceController {

    public override net = NetService.getInstance<NetService>();
    public override app = AppService.getInstance<AppService>();
    public override system = DesktopSystemService.getInstance<DesktopSystemService>();
    public override thumbnail = DesktopThumbService.getInstance<DesktopThumbService>();
    public override files = DesktopFilesService.getInstance<DesktopFilesService>();

    async setup() {
        console.log("Setting up services...");
        await this.app.init();
        this.system.init();
        this.files.init();
        this.thumbnail.init();
        this.net.init(new Map(
            [
                [ConnectionType.LOCAL, new TCPInterface(TCP_PORT)],
            ]
        ));

        await this.startAll();
        this.readyState = true;
        this.readyStateSignal.dispatch(this.readyState);
    }

    private async startAll() {
        // Start services.
        console.log("Starting services...");
        await this.app.start();
        await this.net.start();
        await this.system.start();
        await this.files.start();
        await this.thumbnail.start();
        console.log("All services started.");
    }
}
