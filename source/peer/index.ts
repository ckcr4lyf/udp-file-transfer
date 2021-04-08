import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import UDPHeader from "../common/udpHeader";
import { MESSAGES, ACKS } from '../common/constants';
import { message, promiseResolver } from "../common/interfaces";
import { timeInterval } from "../common/utilities";

const TIMEOUT_MULTIPLIER = 50; //Multiply ping by this amount
const RECV_RATIO_TIMEOUT_STAY = 0.99; // If we got this ratio of packets but timed out, do not half
const CONSECUTIVE_FULL_WINDOW_DOUBLE = 50;  // If we get this many consecutive 100% windows after a timeout, we enable double again.

export default class Peer {

    public serverAddress: string;
    public serverPort: number;
    public socket: dgram.Socket;
    public timeout: null | NodeJS.Timeout;
    public lastRequest: null | message;
    public recvMessages: message[];
    public window: message[];
    public sentAt: number;
    public recvAt: number;
    public pingInterval: timeInterval;
    public expected: number; // Expected number of packets in the current window
    public totalExpected: number; // Expected number of packets for current file request.
    public toResolve: undefined | Function;
    public toReject: undefined | Function;

    public timedOut: boolean; // Whether we have timed out previously in this request.
    public timeoutSuccessCounter: number; // Consecutive 100% windows since last timeout
    public dataResolver: promiseResolver;

    public assumeRecv: number;

    constructor(serverAddress: string, serverPort: number) {
        this.serverAddress = serverAddress;
        this.serverPort = serverPort;
        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', this.handleMessage); //All incoming datagrams go here
        this.sentAt = 0;
        this.recvAt = 0;
        this.timeout = null;
        this.lastRequest = null;
        this.recvMessages = [];
        this.window = [];
        this.pingInterval = new timeInterval();
        this.expected = -1;
        this.totalExpected = -1;
        this.assumeRecv = 0;

        this.timedOut = false;
        this.timeoutSuccessCounter = 0;

        this.dataResolver = {
            resolve: () => {},
            reject: () => {},
        }
    }

    ping = async (): Promise<void> => {
        return new Promise((resolve, reject) => {
            const header = new UDPHeader(null, 0x01, 0x01, MESSAGES.PING, 0x00, 0x00);
            const packet = Buffer.concat([header.asBinary()]);
            this.lastRequest = { header, payload: Buffer.alloc(0) }; //So that handle message can track the expected messageNumber
            console.log(`Sending ping!`);
            this.pingInterval.start();                        
            this.socket.send(packet, this.serverPort, this.serverAddress);
            this.toResolve = resolve;
            this.timeout = setTimeout(() => {
                reject();
            }, 2000);
        });
    }

    handlePong = (header: UDPHeader) => {
        this.pingInterval.end();
        if (this.timeout){
            clearTimeout(this.timeout); // So that the rejection doesnt happen
        }
        console.log(`Ping: ${this.pingInterval.asString()}ms`);
        if (this.toResolve){
            this.toResolve();
        }
    }
    
    requestFile = async (filename: string) => {
        const header = new UDPHeader(null, 0x01, 0x01, MESSAGES.FILE_DOWNLOAD_REQUEST, 0x00, filename.length);
        const payload = Buffer.from(filename);
        const packet = Buffer.concat([header.asBinary(), payload]);
        console.log(`Requesting file ${filename}...`);

        // Reset variables
        // this.recvMessages = [];
        // this.totalExpected = -1;


        this.lastRequest = { header, payload };
        this.socket.send(packet, this.serverPort, this.serverAddress);
        this.expected = 5; //At first we expect 5 packets. (TBD?)
        this.sentAt = performance.now();
        // this.timeout = setTimeout(this.handleTimeout, SETTINGS.PEER_RECV_TIMEOUT);
        this.timeout = setTimeout(this.handleTimeout, this.pingInterval.getInterval() * TIMEOUT_MULTIPLIER);

        return new Promise((resolve, reject) => {
            this.dataResolver = { resolve, reject };
        })
    }

    handleTimeout = () => {

        // console.log('Timed out!');
        this.timedOut = true;

        if (this.lastRequest?.header.messageType === MESSAGES.FILE_DOWNLOAD_REQUEST){
            if (this.recvMessages.length === 0){
                console.log(`Received no reply!`);
            } else {
                //Here we either ask for next window, or we yolo with it
                //TODO: Logic to either ask for next window (with same / slower speed)
                //TODO: Repeat current window if too less packets

                // Calculate the packets remaining in this window
                const remainingWindow = this.expected - this.window.length;
                const recvRatio = this.window.length / this.expected;
                console.log(`Received ${this.window.length}/${this.expected} in the timed-out window`);

                // If after this window, we still expected more, then we send an ACK asking for more
                if (this.recvMessages.length + this.assumeRecv + this.expected < this.totalExpected){
                    // Prepare an ACK, asking them to HALVE the windowSize
                    // Since we assume we received the entire window, update recv
                    this.assumeRecv += remainingWindow;

                    // Actually we only halve it if its a mulitple of 2
                    let multiplier = 1;
                    let ackHeader: UDPHeader;

                    if (this.expected % 2 === 0 && recvRatio < RECV_RATIO_TIMEOUT_STAY){
                        multiplier = 0.5;
                        ackHeader = new UDPHeader(null, UDPHeader.makeUInt16(ACKS.HALF, 0x00), 0x01, MESSAGES.ACK, 0x00, 0x00);
                    } else {
                        ackHeader = new UDPHeader(null, UDPHeader.makeUInt16(ACKS.STAY, 0x00), 0x01, MESSAGES.ACK, 0x00, 0x00);
                    }

                    this.expected = this.expected * multiplier;
                    this.window = []; //Clear it for the next request size.

                    if (this.timeout){
                        clearTimeout(this.timeout);
                    }

                    //Send the ACK, requesting a window of half the size
                    this.timeout = setTimeout(this.handleTimeout, this.pingInterval.getInterval() * TIMEOUT_MULTIPLIER);
                    this.socket.send(ackHeader.asBinary(), this.serverPort, this.serverAddress);
                } else {
                    // Else, we can ACK and say ok we done, and just use what we have to build the file
                    console.log(`Received ${this.recvMessages.length} out of ${this.recvMessages[0].header.totalPackets} packets`);
                    this.assembleFile();
                }
            }
        }
    }

    handleMessage = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        // console.log(`Incoming message from ${rinfo.address}:${rinfo.port}`);
        const header = UDPHeader.fromBinary(msg.slice(0, 10));

        if (this.lastRequest && (this.lastRequest.header.messageNumber + 1 === header.messageNumber)){
            if (this.lastRequest.header.messageType === MESSAGES.FILE_DOWNLOAD_REQUEST){
                this.handleFileResponse(msg, header, rinfo);
            } else if (header.messageType === MESSAGES.PONG){
                this.handlePong(header);
            }
        }   
    }

    assembleFile = () => {
        const totalPackets = this.recvMessages[0].header.totalPackets;
        const buffer = Buffer.alloc(totalPackets * 1400);
        let minCopied = 1400;
        let percent = (this.recvMessages.length / totalPackets) * 100;
        const timeTaken = this.recvAt - this.sentAt; //milliseconds

        for (let i = 0; i < this.recvMessages.length; i++){
            // const position = i * 1400;
            //i is the order we got it in, but the actual order is in the header
            const position = (this.recvMessages[i].header.packetNumber - 1) * 1400;
            this.recvMessages[i].payload.copy(buffer, position, 0);
            if (this.recvMessages[i].header.dataLength < 1400){
                console.log(`Min copied is ${this.recvMessages[i].header.dataLength}`);
                minCopied = this.recvMessages[i].header.dataLength;
            }
        }

        //We can delete the last (1400 - minCopied)
        console.log(`Buffer len is ${buffer.length}`);
        const finalFile = buffer.slice(0, buffer.length - (1400 - minCopied)); //E.g. 2800 - (1400 - 600) = 2800 - 800 = 2000
        const throughput = finalFile.length / timeTaken; //bytes / ms = KB/s
        console.log(`Computed final file of size: ${finalFile.length} bytes!`);
        console.log(`Recevied ${this.recvMessages.length}/${totalPackets} in ${(timeTaken).toFixed(2)}ms (${throughput}KB/s)! (${percent.toFixed(2)}%)`);
        console.log(`Filename is ${this.lastRequest?.payload.toString()}`);

        //Write file to disk
        fs.writeFileSync(path.join(__dirname, '../../recvFiles', this.lastRequest?.payload.toString() || 'backup.bin'), finalFile);

        this.lastRequest = null;
        this.recvMessages = [];
        this.window = [];
        this.expected = 0;
        this.totalExpected = -1;
        this.timedOut = false;
        this.timeoutSuccessCounter = 0;

        if (this.timeout){
            clearTimeout(this.timeout);
        }

        this.dataResolver.resolve();
    }

    handleFileResponse = (msg: Buffer, header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        if (header.messageType === MESSAGES.FILE_DOWNLOAD_NOT_FOUND){
            console.log("File not found!");
            
            if (this.timeout){
                clearTimeout(this.timeout);
            }

            this.lastRequest = null;
            this.expected = 0;
        } else {
            const message: message = {
                header: header,
                payload: msg.slice(10) //Everything after first 10 bytes is the payload
            };

            // console.log(`Recv packet number ${header.packetNumber}`);
            this.recvAt = performance.now();
            this.recvMessages.push(message);

            //Set totalExpected if not set
            if (this.totalExpected === -1){
                this.totalExpected = header.totalPackets;
            }

            //If we got everything, dont need to wait for window.
            if (this.recvMessages.length === header.totalPackets){
                this.assembleFile();
                if (this.timeout){
                    clearTimeout(this.timeout);
                }
                return;
            }

            //Otherwise we wait for our window to fill up
            this.window.push(message);

            if (this.window.length === this.expected){
                //Our window is full PogU
                //Send the ACK?
                console.log(`Window of size ${this.expected} is full!`);
                this.window = []; //Our window is already in this.recvMessages

                // If we have previsouly timed out, we do not want to increase window size
                let ackHeader: UDPHeader;

                if (this.timedOut === true){
                    this.timeoutSuccessCounter++;

                    if (this.timeoutSuccessCounter === CONSECUTIVE_FULL_WINDOW_DOUBLE){
                        console.log(`${CONSECUTIVE_FULL_WINDOW_DOUBLE} successfull 100%! will allow window to be doubled again`);
                        this.timedOut = false;
                        this.timeoutSuccessCounter = 0;
                    }
                }

                if (this.timedOut === true){
                    // Do not change this.expected (window size)
                    ackHeader = new UDPHeader(null, UDPHeader.makeUInt16(ACKS.STAY, 0x00), 0x01, MESSAGES.ACK, 0x00, 0x00); //zero length ack = all good. Double it
                } else {
                    this.expected = this.expected * 2; //5 -> 10 -> 20...
                    ackHeader = new UDPHeader(null, UDPHeader.makeUInt16(ACKS.DOUBLE, 0x00), 0x01, MESSAGES.ACK, 0x00, 0x00); //zero length ack = all good. Double it
                }
                
                //Reset timeout
                if (this.timeout){
                    clearTimeout(this.timeout);
                }

                //Request the next window
                this.timeout = setTimeout(this.handleTimeout, this.pingInterval.getInterval() * TIMEOUT_MULTIPLIER);
                this.socket.send(ackHeader.asBinary(), this.serverPort, this.serverAddress);
            }
        }
    }
}