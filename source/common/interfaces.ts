import RequestHandler from "../request";
import { JOB_STATUS, PEER_STATUS, STATUS } from "./constants";
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

export interface promiseResolver {
    resolve: Function,
    reject: Function,
}

export interface fileDict {
    [filename: string]: fileMeta,
}

export interface fileMeta {
    status: STATUS
}

export interface peerInfo {
    peerAddress: string,
    peerPort: number,
    hash: string,
    status: PEER_STATUS,
}

export interface Job {
    filename: string,
    status: JOB_STATUS,
    resolve?: Function,
    reject?: Function,
    peersTried: string[],
    handler: null | RequestHandler,
}