import UDPHeader from "./udpHeader";

export interface message {
    header: UDPHeader,
    payload: Buffer
}

export interface fileData {
    totalPackets: number;
    fullPackets: number;
    leftoverSize: number;
    file: Buffer
}

export interface fileXfer {
    windowSize: number;
    packetPosition: number;
    messageNumber: number;
}

export interface lastWindow {
    position: number,
    count: number
}