import UDPHeader from "./udpHeader";

export interface message {
    header: UDPHeader,
    payload: Buffer
}
