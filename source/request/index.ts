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

        if (messageHeader.messageType === MESSAGES.ACK){
            this.log.trace(`Received an ACK`);
        }
    }
}