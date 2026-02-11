import { WebcInterface } from "shared/webcInterface";
import { Datagram_ } from "../desktopCompat";

export default class DesktopWebcInterface extends WebcInterface {
    createDatagramSocket(): Datagram_ {
        return new Datagram_();
    }
}
