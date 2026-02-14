import { WebcInterface } from "shared/webcInterface";
import { DatagramCompat } from "shared/compat";
import { createBestDatagram } from "../desktopCompat";

export default class DesktopWebcInterface extends WebcInterface {
    createDatagramSocket(): DatagramCompat {
        return createBestDatagram();
    }
}
