import ServiceController from "shared/services/controller";
import { NetService } from "shared/services/netService";
import { AppService } from "shared/services/appService";
import TCPInterface from "./services/tcpInterface";
import { ConnectionType } from "shared/types";
import MobileSystemService from "./services/systemService";
//import MobileThumbService from "./thumb/thumbService";
//import MobileFilesService from "./files/filesService";
//import { MobilePhotosService } from "./photos/photosService";

const TCP_PORT = 7736;

export default class MobileServiceController extends ServiceController {

    public override net = NetService.getInstance<NetService>();
    public override app = AppService.getInstance<AppService>();
    public override system = MobileSystemService.getInstance<MobileSystemService>();
    // public override thumbnail = MobileThumbService.getInstance<MobileThumbService>();
    // public override files = MobileFilesService.getInstance<MobileFilesService>();
    // public override photos = MobilePhotosService.getInstance<MobilePhotosService>();

    async setup() {
        console.log("Setting up services...");
        await this.app.init();
        await this.system.init();
        //await this.files.init();
        //await this.thumbnail.init();
        //await this.photos.init();
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
        //await this.files.start();
        //await this.thumbnail.start();
        //await this.photos.start();
        console.log("All services started.");
    }
}
