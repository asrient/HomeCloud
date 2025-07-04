import { RPCController } from "./primatives";
import { NetService } from "./netService";
import { AppService } from "./appService";
import { SystemService } from "./systemService";
import { ThumbService } from "./thumbService";
import { FilesService } from "./filesService";
import Signal from "../signals";
import { generateServicesDoc } from "../doc";
import { PhotosService } from "./photosService";

export default class ServiceController extends RPCController {
    private static localInstance: RPCController | null = null;
    public net: NetService;
    public app: AppService;
    public system: SystemService;
    public thumbnail: ThumbService;
    public files: FilesService;
    public photos: PhotosService;

    public readyState: boolean = false;
    public readyStateSignal = new Signal<[boolean]>();

    public static async getRemoteInstance(fingerprint: string): Promise<ServiceController> {
        const localService = this.getLocalInstance();
        const remoteService = await localService.net.getRemoteServiceController<ServiceController>(fingerprint);
        return remoteService;
    }

    static getLocalInstance<T extends ServiceController>(): T {
        if (!this.localInstance) {
            this.localInstance = new this();
        }
        return this.localInstance as T;
    }

    getDoc() {
        return generateServicesDoc(this);
    }
}
