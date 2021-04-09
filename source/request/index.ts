import dgram from 'dgram';
import path from 'path';
import fs from 'fs';
import { ACKS, MESSAGES } from '../common/constants';
import UDPHeader from '../common/udpHeader';
import { performance } from 'perf_hooks';
import { sleep, timeInterval } from '../common/utilities';
import { SETTINGS } from '../../settings';
import { fileData, fileXfer, message, promiseResolver } from '../common/interfaces';
import { Logger } from '../common/logger';


// This class contains a "connection" with a peer 
// via an "outgoing" UDP socket, and associates 
// the replies within itself

const RECV_TIMEOUT = 10 * 50; // 500 milliseconds?
const RECV_RATIO_TIMEOUT_STAY = 0.99; // If we got this ratio of packets but timed out, do not half
const CONSECUTIVE_FULL_WINDOW_DOUBLE = 50;  // If we get this many consecutive 100% windows after a timeout, we enable double again.

export default class Request {

    // Essentials for comms with another peer
    public peerAddress: string;
    public peerPort: number;
    public socket: dgram.Socket;
    public folderRoot: string;

    // Essentials for sending a file
    public fileData: fileData;
    public fileXfer: fileXfer;

    // Essentials for requesting a file
    public timeout: null | NodeJS.Timeout;
    public request: null | message;
    public recvMessages: message[]; // The packets received w/ file data
    public recvWindow: message[]; // The packets for the current window
    public recvWindowExpected: number; // Number of packets expected in current window
    public totalExpected: number; // Total number of packets expected for this file
    public recvAssumedCount: number; // Number of packets assumed to have been received (counting lost)
    public finalPort: boolean; // Initially false, when the server replies we update port.

    // Related to timeouts
    public timedOut: boolean;
    public timeoutSuccessCounter: number;

    // For timing
    public sentAt: number;
    public recvAt: number;
    public pingInterval: timeInterval;

    // Juggling promises
    public pingResolver: promiseResolver;
    public dataResolver: promiseResolver;

    //Log
    public log: Logger;

    constructor(peerAddress: string, peerPort: number, folderRoot: string, request: null | message){
        this.peerAddress = peerAddress;
        this.peerPort = peerPort;
        this.folderRoot = folderRoot;
        this.finalPort = true;

        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', this.handleMessage);

        this.log = new Logger(2); //TODO: Loglevel in global constant

        // The stuff about the file we need to send
        this.fileData = {
            totalPackets: 0,
            fullPackets: 0,
            leftoverSize: 0,
            file: Buffer.alloc(0),
        };

        // The current transfer status / info
        this.fileXfer = {
            windowSize: 0,
            packetPosition: 0,
            messageNumber: 0, // This should be request message number + 1
        };

        // The peer recv stuffs

        this.request = null; // Null initially, if we have it set at the end

        //Timing
        this.sentAt = 0;
        this.recvAt = 0;
        this.timeout = null;
        this.timedOut = false;
        this.timeoutSuccessCounter = 0;
        this.pingInterval = new timeInterval();

        // Window stuffs
        this.recvMessages = [];
        this.recvWindow = [];
        this.recvWindowExpected = -1;
        this.totalExpected = -1;
        this.recvAssumedCount = 0;

        // Seed resolvers with empty functions
        this.pingResolver = {
            resolve: () => {},
            reject: () => {},
        };

        this.dataResolver = {
            resolve: () => {},
            reject: () => {},
        };       


        // If it was seeded with a received request on listening port
        // add it here, and then handle it accordingly.

        // But if we make the request, then we probably dont need this? TBD
        if (request !== null){
            this.request = request;

            // TBD: this.handleMessage(); ?
        }

        // TODO: Function map of how to handle types of messages
    }

    handleMessage(message: Buffer, remoteInfo: dgram.RemoteInfo){

        this.log.trace(`Incoming message from ${remoteInfo.address}:${remoteInfo.port}`);

        // Try and parse first 10 bytes into the header
        const messageHeader = UDPHeader.fromBinary(message.slice(0, 10));

        /**
         * Messages to handle:
         * 
         * ACK
         * If we are sending a file to someone, then their ACK which controls the rate
         * Only handled if this request is responding to a file download message
         * 
         * FILE_DATA
         * If we had requested a file, then the incoming data from the peer (acting as a server)
         * Note: We send request to their listening port, but probably receive from another
         * We should update server port here because this is what expects our ACKs
         * 
         */

        if (this.request === null){
            this.log.error(`Received a message while request is null! Ignoring`);
            return;
        }

        if (this.request.header.messageNumber + 1 !== messageHeader.messageNumber){
            this.log.warn(`Received message for some other request. Ignoring...`);
            return;
        }

        // Acting as server
        if (messageHeader.messageType === MESSAGES.ACK){
            this.log.trace(`Received an ACK`);
            this.handleAck(messageHeader, messageHeader, remoteInfo);
        }

        // Acting as client
        if (messageHeader.messageType === MESSAGES.FILE_DOWNLOAD_CONTENTS){
            this.log.trace(`Received file data`);
            this.handleFileResponse(message, messageHeader, remoteInfo);
        }
    }

    // Acting as client
    
    /**
     * requestFile takes a filename to request, and sends a request to the peer
     * It also initializes a recvWindow and timeout, and returns a promise
     * which will eventually be resolved when the download is complete.
     * 
     * @param filename The file to request from the peer
     * @returns Promise which resolves when the download is complete
     */
    requestFile(filename: string){

        const messageHeader = new UDPHeader(null, 0x01, 0x01, MESSAGES.FILE_DOWNLOAD_REQUEST, 0x00, filename.length);
        const payload = Buffer.from(filename);
        const packet = Buffer.concat([messageHeader.asBinary(), payload]);
        this.log.info(`Requesting file ${filename}`);

        this.request = {
            header: messageHeader,
            payload: payload,
        };

        this.recvWindowExpected = 5; // Initial window size
        this.recvMessages = [];
        this.recvWindow = [];
        this.totalExpected = -1;
        this.finalPort = false; // We are sending to servers listening, but will update on first reply
        this.sentAt = performance.now();
        
        // Send the actual request
        this.socket.send(packet, this.peerPort, this.peerAddress);

        // Register the timeout handler (for entire window)
        this.timeout = setTimeout(this.handleTimeout, RECV_TIMEOUT);

        // Return a promise, store the resolution functions for later use
        return new Promise((resolve, reject) => {
            this.dataResolver = { resolve, reject };
        });
    }

    handleFileResponse(packet: Buffer, messageHeader: UDPHeader, remoteInfo: dgram.RemoteInfo){

        const message: message = {
            header: messageHeader,
            payload: packet.slice(10),
        };

        this.log.trace(`Received packet number ${messageHeader.packetNumber}`);

        // Update the server port to the one its using for our request
        if (this.finalPort === false){
            this.peerPort = remoteInfo.port;
            this.finalPort = true;
        }

        this.recvAt = performance.now();
        this.recvMessages.push(message);

        // Set the total expected for this file, if not yet set
        if (this.totalExpected === -1){
            this.totalExpected = messageHeader.totalPackets;
        }

        // If this packet means we got it all, then we can move on directly
        if (this.recvMessages.length === this.totalExpected){
            this.log.info(`Received all packets!`);
            this.assembleFile();

            if (this.timeout !== null){
                clearTimeout(this.timeout);
            }

            return;
        }

        // Otherwise we wait for window to fill up (or timeout)
        this.recvWindow.push(message);

        // Check if window is full
        if (this.recvWindow.length === this.recvWindowExpected){
            this.log.debug(`Window of size ${this.recvWindowExpected} is full!`);
            this.recvWindow = []; // Messages are already "saved" in this.recvMessages

            let ackHeader: UDPHeader;

            if (this.timedOut === true){
                // We have previously timed out
                this.timeoutSuccessCounter++;

                if (this.timeoutSuccessCounter === CONSECUTIVE_FULL_WINDOW_DOUBLE){
                    this.log.info(`${CONSECUTIVE_FULL_WINDOW_DOUBLE} 100% windows. Will allow window to be doubled again`);
                    this.timedOut = false;
                    this.timeoutSuccessCounter = 0;
                }
            }

            if (this.timedOut === true){
                // We were previously timed out. So send the ACK to stay at current window size (instead of double)
                ackHeader = new UDPHeader(null, UDPHeader.makeUInt16(ACKS.STAY, 0x00), 0x01, MESSAGES.ACK, 0x00, 0x00);
            } else {
                this.recvWindowExpected *= 2;
                ackHeader = new UDPHeader(null, UDPHeader.makeUInt16(ACKS.DOUBLE, 0x00), 0x01, MESSAGES.ACK, 0x00, 0x00);
            }

            // Reset any window timeout
            if (this.timeout){
                clearTimeout(this.timeout);
            }

            // Request next window
            this.timeout = setTimeout(this.handleTimeout, RECV_TIMEOUT);
            this.socket.send(ackHeader.asBinary(), this.peerPort, this.peerAddress);
        }        
    }

    handleTimeout(){

        this.timedOut = true;
        this.timeoutSuccessCounter = 0;

        // Currently only handle timeouts when we request a file download
        if (this.request?.header.messageType === MESSAGES.FILE_DOWNLOAD_REQUEST){

            if (this.recvWindow.length === 0){
                // Got nothing in this window!
                // Prolly request / ACK lost.
                // TODO: handle this.
                this.log.warn(`Receive window was empty at the timeout (No packets received)`);
                return;
            }

            const remainingWindow = this.recvWindowExpected - this.recvWindow.length;
            const recvRatio = this.recvWindow.length / this.recvWindowExpected;
            this.log.info(`Time out! Received ${recvRatio * 100}% packets in window of size ${this.recvWindowExpected}`);

            // If we still expect more for this file, then we should send the corresponding ACK
            if (this.recvMessages.length + this.recvAssumedCount + this.recvWindowExpected < this.totalExpected){

                // Update recvAssumedCount as if we received all the packets
                this.recvAssumedCount += remainingWindow;

                let multiplier = 1;
                let ackHeader: UDPHeader;

                if (this.recvWindowExpected % 2 === 0 && recvRatio < RECV_RATIO_TIMEOUT_STAY){
                    this.log.debug(`Halving the recv window size`);
                    multiplier = 0.5;
                    ackHeader = new UDPHeader(null, UDPHeader.makeUInt16(ACKS.HALF, 0x00), 0x01, MESSAGES.ACK, 0x00, 0x00);
                } else {
                    // Keep multiplier at 1 as % of packets receives is above out threshold.
                    ackHeader = new UDPHeader(null, UDPHeader.makeUInt16(ACKS.STAY, 0x00), 0x01, MESSAGES.ACK, 0x00, 0x00);
                }

                this.recvWindowExpected *= multiplier;
                this.recvWindow = [];

                // Reset any window timeout
                if (this.timeout){
                    clearTimeout(this.timeout);
                }

                // Request next window
                this.timeout = setTimeout(this.handleTimeout, RECV_TIMEOUT);
                this.socket.send(ackHeader.asBinary(), this.peerPort, this.peerAddress);
            } else {
                // This was the last window anyway. Just assemble the file with what we have
                this.log.info(`Received ${this.recvMessages.length}/${this.totalExpected} packets.`);
                this.assembleFile();
            }
        }
    }

    assembleFile(){

        const buffer = Buffer.alloc(this.totalExpected * 1400);
        let minCopied = 1400;
        let recvRatio = this.recvMessages.length / this.totalExpected;
        const timeTaken = this.recvAt - this.sentAt;

        // Loop over the messages, find correct position, copy it into buffer
        for (let i = 0; i < this.recvMessages.length; i++){

            const packetIndex = this.recvMessages[i].header.packetNumber - 1;
            const filePosition = packetIndex * 1400;
            this.recvMessages[i].payload.copy(buffer, filePosition);

            if (this.recvMessages[i].payload.length < 1400){
                this.log.debug(`Min copied is ${this.recvMessages[i].payload.length}`);
                minCopied = this.recvMessages[i].payload.length;
            }
        }

        this.log.trace(`Buffer len is ${buffer.length}`);
        const extraBytes = 1400 - minCopied; // The last packet probably had less than 1400 bytes. We need to trim this from the final buffer
        const finalFileSize = buffer.length - extraBytes;
        const finalFile = buffer.slice(0, finalFileSize);
        const throughput = finalFileSize / timeTaken; // (bytes / milliseconds) = KB/s
        this.log.info(`Received ${recvRatio * 100}% of the file in ${timeTaken.toFixed(2)}ms. (${throughput.toFixed(2)}KB/s!)`);
        this.log.info(`Filename is ${this.request?.payload.toString()}`);

        // Write the file to disk
        fs.writeFileSync(path.join(this.folderRoot, this.request?.payload.toString() || 'backup.bin'), finalFile);

        // Reset params
        this.request = null;
        this.recvMessages = [];
        this.recvWindowExpected = -1;
        this.recvWindow = [];
        this.timedOut = false;
        this.timeoutSuccessCounter = 0;
        this.recvWindowExpected = 0;

        if (this.timeout !== null){
            clearTimeout(this.timeout);
        }

        this.dataResolver.resolve();
    }

}