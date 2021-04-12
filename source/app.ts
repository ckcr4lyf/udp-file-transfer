import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { MESSAGES } from './common/constants';
import { Logger } from './common/logger';
import UDPHeader from './common/udpHeader';
import RequestHandler from './request';

// To be called as
// node app.js 3333 recvFiles peer 127.0.0.1:4444
// i.e. need to specify server address
// or
// node app.js 4444 sendFiles server

const log = new Logger(1);

const args = process.argv;
const address = '127.0.0.1';
const port = parseInt(args[2]);
const folderRoot = path.join(process.cwd(), args[3]);
const mode = args[4];

if (isNaN(port)){
    log.error(`Invalid port. Exiting.`);
    process.exit(-1);
}

log.info(`Folder root set to ${folderRoot}`);

// Create the sockets and stuffs
const socket = dgram.createSocket('udp4');

socket.on('error', (socketError: NodeJS.ErrnoException) => {
    if (socketError.code === 'EADDRINUSE'){
        log.error(`Failed to bind to ${address}:${port} since it is in use.`);
        process.exit(-1);
    } else {
        console.log(`Socket encountered an error`, socketError, socketError.name);
    }
});

/**
 * Only incoming messages to handle (on listening port) rn are:
 * 
 * 1. File Download Request
 */

socket.on('message', (message: Buffer, remoteInfo: dgram.RemoteInfo) => {

    // Parse the type out of the UDP header
    const header = UDPHeader.fromBinary(message.slice(0, 10));
    log.debug(`Received a message from ${remoteInfo.address}:${remoteInfo.port}`);

    if (header.messageType === MESSAGES.FILE_DOWNLOAD_REQUEST){

        // Create a new socket thingy for it
        const requestHandler = new RequestHandler(remoteInfo.address, remoteInfo.port, folderRoot, {
            header: header,
            payload: message.slice(10),
        });
    } else {
        log.error(`Recevied a non file download request on the listening port. Message Type: ${header.messageType}`);
    }
});

// Bind
socket.bind(port, address, () => {
    log.info(`Listening on ${address}:${port}`);
});

if (mode === 'server'){
    log.info(`App started in server mode!`);
} else if (mode === 'peer'){
    log.info(`App started in peer mdoe!`);
} else {
    log.error(`Invalid mode! Exiting...`);
}

// Now, if we are peer, we manually request a couple of files
// TODO: m3u8 based logic

if (args.length >= 7){
    const mode = args[4];
    const serverIp = args[5];
    const serverPort = parseInt(args[6]);

    // Hardcoded for now
    const fileToRequest = 'hate0.ts';

    const fileRequester = new RequestHandler(serverIp, serverPort, folderRoot, null);

    const result = fileRequester.requestFile(fileToRequest);
}