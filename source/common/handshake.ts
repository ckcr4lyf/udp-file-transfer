import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { FILES, FOLDER_ROOT, LOGLEVEL, PEERS } from '../app';
import RequestHandler from '../request';
import { MESSAGES, STATUS } from './constants';
import { Logger } from './logger';
import UDPHeader from './udpHeader';



// If we send handshake from our listening port, we dont care to send port info
//TODO: Timeout
export const sendHandshake = (socket: dgram.Socket, peerAddress: string, peerPort: number) => {
    const log = new Logger(LOGLEVEL);
    const header = new UDPHeader(null, 0x01, 0x01, MESSAGES.HANDSHAKE_REQUEST, 0x00, 0x00);
    log.debug(`Sending handshake request to ${peerAddress}:${peerPort}`);
    socket.send(header.asBinary(), peerPort, peerAddress);
}

export const replyHandshake = (socket: dgram.Socket, remoteInfo: dgram.RemoteInfo, messageNumber: number) => {
    const log = new Logger(LOGLEVEL);
    const header = new UDPHeader(messageNumber, 0x01, 0x01, MESSAGES.HANDSHAKE_RESPONSE, 0x00, 0x00);
    log.debug(`Replying to handshake from ${remoteInfo.address}:${remoteInfo.port}`);
    socket.send(header.asBinary(), remoteInfo.port, remoteInfo.address);
}

export const findPeer = (address: string, port: number) => {
    return PEERS.find(peer => {
        peer.peerAddress === address && peer.peerPort === port
    });
}