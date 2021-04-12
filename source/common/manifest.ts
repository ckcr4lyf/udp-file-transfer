import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { FILES, FOLDER_ROOT, LOGLEVEL } from '../app';
import RequestHandler from '../request';
import { MESSAGES, STATUS } from './constants';
import { Logger } from './logger';
import UDPHeader from './udpHeader';

export const sendManifest = (socket: dgram.Socket, remoteInfo: dgram.RemoteInfo, manifest: Buffer, messageNumber: number) => {
    const log = new Logger(LOGLEVEL);
    const header = new UDPHeader(messageNumber, 0x01, 0x01, MESSAGES.MANIFEST_RESPONSE, 0x00, manifest.length);
    const packet = Buffer.concat([header.asBinary(), manifest]);
    log.debug(`Sending manifest to ${remoteInfo.address}:${remoteInfo.port}`);
    socket.send(packet, remoteInfo.port, remoteInfo.address);
}

export const parseManifest = (manifest: Buffer) => {
    const log = new Logger(LOGLEVEL);
    const tempPath = path.join(FOLDER_ROOT, 'live.m3u8.tmp');
    const realPath = path.join(FOLDER_ROOT, 'live.m3u8');
    fs.writeFileSync(tempPath, manifest);
    log.trace(`Wrote manifest to temp file`);
    fs.renameSync(tempPath, realPath);
    log.trace(`Renamed temp file to actual file`);
    return manifest.toString().split('\n').filter(line => line[0] !== '#');
}

export const getFile = (serverIp: string, serverPort: number, filename: string): Promise<unknown> => {

    const log = new Logger(LOGLEVEL);

    // Check if file is in folder root
    const filepath = path.join(FOLDER_ROOT, filename);

    if (fs.existsSync(filepath) === true){

        log.trace(`Already have file ${filename}`);
        FILES[filename] = {
            status: STATUS.HAVE
        };

        return Promise.resolve();
    }

    // We need to request it
    const requester = new RequestHandler(serverIp, serverPort, FOLDER_ROOT, null);
    return requester.requestFile(filename);
}