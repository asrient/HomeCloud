import NodeWebcInterface from "nodeShared/webcInterface.js";
import { DatagramCompat } from "shared/compat.js";
import { Datagram_ } from "nodeShared/netCompat.js";

export default class ServerWebcInterface extends NodeWebcInterface {
    createDatagramSocket(): DatagramCompat {
        return new Datagram_();
    }
}
