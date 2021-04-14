import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { MESSAGES, PEER_STATUS, STATUS } from './common/constants';
import { addPeer, addPeers, findPeer, replyHandshake, replyPeers, requestPeers, sendHandshake } from './common/handshake';
import { fileDict, fileMeta, Job, peerInfo } from './common/interfaces';
import { Logger } from './common/logger';
import { getFile, parseManifest, segmentJob, sendManifest } from './common/manifest';
import UDPHeader from './common/udpHeader';
import { remoteInfoToHash } from './common/utilities';
import RequestHandler from './request';

// To be called as
// node app.js 3333 recvFiles peer 127.0.0.1:4444
// i.e. need to specify server address
// or
// node app.js 4444 sendFiles server

const args = process.argv;
const address = '127.0.0.1';
const MANIFEST_FILENAME = 'live.m3u8';
const MANIFEST_POLL_TIME = 3000;
const mode = args[4];

export const PORT = parseInt(args[2]);
export const FOLDER_ROOT = path.join(process.cwd(), args[3]);
export const LOGLEVEL = 2;
export const QUEUE_LOGLEVEL = 2; // For debugging queue exclusively
export const QUEUE_LOG = new Logger(QUEUE_LOGLEVEL);


const log = new Logger(LOGLEVEL);
let manifest: Buffer = Buffer.alloc(0);

export const setManifest = (buffer: Buffer) => {
    manifest = buffer;
    log.trace(`Updated manifest in main app`);
}

export let FILES: fileDict = {};
export let PEERS: peerInfo[] = [];
export let JOBS: Job[] = [];

if (isNaN(PORT)){
    log.error(`Invalid port. Exiting.`);
    process.exit(-1);
}

log.info(`Folder root set to ${FOLDER_ROOT}`);

// Create the sockets and stuffs
const socket = dgram.createSocket('udp4');

socket.on('error', (socketError: NodeJS.ErrnoException) => {
    if (socketError.code === 'EADDRINUSE'){
        log.error(`Failed to bind to ${address}:${PORT} since it is in use.`);
        process.exit(-1);
    } else {
        console.log(`Socket encountered an error`, socketError, socketError.name);
    }
});

/**
 * Only incoming messages to handle (on listening port) rn are:
 * 
 * 1. File Download Request (create handler on new socket)
 * 2. Manifest request (insta-reply)
 * 3. Handshake request (insta-reply)
 * 4. Handshake response (no reply)
 * 5. Peerlist request (insta-reply)
 * 6. Peerlist response (no reply)
 */

socket.on('message', (message: Buffer, remoteInfo: dgram.RemoteInfo) => {

    // Parse the type out of the UDP header
    const header = UDPHeader.fromBinary(message.slice(0, 10));
    log.trace(`Received a message from ${remoteInfo.address}:${remoteInfo.port}`);

    if (header.messageType === MESSAGES.FILE_DOWNLOAD_REQUEST){

        // Create a new socket thingy for it
        const requestHandler = new RequestHandler(remoteInfo.address, remoteInfo.port, FOLDER_ROOT, {
            header: header,
            payload: message.slice(10),
        });

    } else if (header.messageType === MESSAGES.MANIFEST_REQUEST){
        sendManifest(socket, remoteInfo, manifest, header.messageNumber + 1);
    } else if (header.messageType === MESSAGES.HANDSHAKE_REQUEST){
        replyHandshake(socket, remoteInfo, header.messageNumber + 1);

        // If not in peers, add
        // if (findPeer(remoteInfo.address, remoteInfo.port) === undefined){

        addPeer({
            hash: remoteInfoToHash(remoteInfo),
            peerAddress: remoteInfo.address,
            peerPort: remoteInfo.port,
            status: PEER_STATUS.AVAILABLE,
        });

        // } else {
        //     log.debug(`Received handshake from peer already in list (${remoteInfo.address}:${remoteInfo.port})`);
        // }

    } else if (header.messageType === MESSAGES.HANDSHAKE_RESPONSE){
        // Add to peers
        // if (findPeer(remoteInfo.address, remoteInfo.port) === undefined){
        //     log.info(`Adding new peer ${remoteInfo.address}:${remoteInfo.port} to PEERS!`);

        addPeer({
            hash: remoteInfoToHash(remoteInfo),
            peerAddress: remoteInfo.address,
            peerPort: remoteInfo.port,
            status: PEER_STATUS.AVAILABLE,
        });

        // } else {
        //     log.debug(`Received handshake reply from peer already in list (${remoteInfo.address}:${remoteInfo.port})`);
        // }
    } else if (header.messageType === MESSAGES.PEERLIST_REQUEST){
        replyPeers(socket, remoteInfo, header.messageNumber + 1);
    } else if (header.messageType === MESSAGES.PEERLIST_RESPONSE){
        addPeers(message.slice(10));
    } else {
        log.error(`Recevied a non file download request on the listening port. Message Type: ${header.messageType}`);
    }
});

// Bind
socket.bind(PORT, address, () => {
    log.info(`Listening on ${address}:${PORT}`);
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

if (mode === 'peer' && args.length >= 7){

    const mode = args[4];
    const serverIp = args[5];
    const serverPort = parseInt(args[6]);

    // Handshake w/ server
    sendHandshake(socket, serverIp, serverPort);
    requestPeers(socket, serverIp, serverPort);

    // Hardcoded for now
    // const fileToRequest = 'hate0.ts';
    // const fileRequester = new RequestHandler(serverIp, serverPort, FOLDER_ROOT, null);

    // const result = fileRequester.requestFile(fileToRequest);
    // (async() => {
    //     try {
    //         manifest = await fileRequester.requestManifest();
    //         let filenames = parseManifest(manifest);
    //         log.debug(`Updated manifest in main app`);

    //         for (let filename of filenames){
    //             if (filename in FILES){
    //                 if (FILES[filename].status === STATUS.DONT_HAVE){
    //                     await getFile(serverIp, serverPort, filename);
    //                 }
    //             } else {
    //                 await getFile(serverIp, serverPort, filename);
    //             }
    //         }
    //     } catch (e){
    //         log.error(`Failed to get manifest.`);
    //     }  
    // })();

    setInterval(() => {
        segmentJob(serverIp, serverPort);
    }, 3000);

    setInterval(() => {
        requestPeers(socket, serverIp, serverPort);
    }, 3000);
}

if (mode === 'server'){
    manifest = fs.readFileSync(path.join(FOLDER_ROOT, MANIFEST_FILENAME));

    // Poll manifest
    setInterval(() => {
        manifest = fs.readFileSync(path.join(FOLDER_ROOT, MANIFEST_FILENAME));
        log.trace(`Updated manifest contents!`);
    }, MANIFEST_POLL_TIME);
}