import UDPHeader from "../common/udpHeader";
import { MESSAGES } from '../common/constants';
import dgram from 'dgram';
import { message } from "../common/interfaces";
import { SETTINGS } from "../../settings";
import { performance } from 'perf_hooks';
import { timeInterval } from "../common/utilities";

const TIME_LIMIT = 5000;

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
    public expected: number;
    public toResolve: undefined | Function;
    public toReject: undefined | Function;

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
        this.lastRequest = { header, payload };
        this.socket.send(packet, this.serverPort, this.serverAddress);
        this.expected = 5; //At first we expect 5 packets. (TBD?)
        this.sentAt = performance.now();
        // this.timeout = setTimeout(this.handleTimeout, SETTINGS.PEER_RECV_TIMEOUT);
        this.timeout = setTimeout(this.handleTimeout, this.pingInterval.getInterval());
    }

    handleTimeout = () => {
        console.log('Timed out!');
        if (this.lastRequest?.header.messageType === MESSAGES.FILE_DOWNLOAD_REQUEST){
            if (this.recvMessages.length === 0){
                console.log(`Received no reply!`);
            } else {
                this.assembleFile();
                // console.log(`Received ${this.recvMessages.length} out of ${this.recvMessages[0].header.totalPackets} packets`);
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
        console.log(`Recevied ${this.recvMessages.length}/${totalPackets} in ${(this.recvAt - this.sentAt).toFixed(2)}ms! (${percent.toFixed(2)}%)`);
        console.log(`Filename is ${this.lastRequest?.payload.toString()}`);

        for (let i = 0; i < this.recvMessages.length; i++){
            const position = i * 1400;
            this.recvMessages[i].payload.copy(buffer, position, 0);
            // console.log(`Copied ${bytesCopied} bytes for packet #${this.recvMessages[i].header.packetNumber}`);
            if (this.recvMessages[i].header.dataLength < 1400){
                console.log(`Min copied is ${this.recvMessages[i].header.dataLength}`);
                minCopied = this.recvMessages[i].header.dataLength;
            }
        }

        //We can delete the last (1400 - minCopied)
        console.log(`Buffer len is ${buffer.length}`);
        const finalFile = buffer.slice(0, buffer.length - (1400 - minCopied)); //E.g. 2800 - (1400 - 600) = 2800 - 800 = 2000
        console.log(`Computed final file of size: ${finalFile.length} bytes!`);
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
                payload: msg.slice(10)
            };

            this.recvAt = performance.now();
            this.recvMessages.push(message);

            //If we got everything, dont need to wait for window.
            if (this.recvMessages.length === header.totalPackets){
                this.assembleFile();

                //Now we clear it
                this.lastRequest = null;
                this.recvMessages = [];
                this.window = [];
                this.expected = 0;

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
                this.expected = this.expected * 2; //5 -> 10 -> 20...
                const ackHeader = new UDPHeader(null, 0x01, 0x01, MESSAGES.ACK, 0x00, 0x00); //zero length ack = all good. Double it
                //Reset timeout
                if (this.timeout){
                    clearTimeout(this.timeout);
                }
                this.timeout = setTimeout(this.handleTimeout, SETTINGS.PEER_RECV_TIMEOUT);
                this.socket.send(ackHeader.asBinary(), this.serverPort, this.serverAddress);
            }

            /*
            this.recvMessages.push(message);
            this.recvAt = performance.now();

            if (this.recvMessages.length === header.totalPackets){
                // console.log('Received all packets!');
                // console.log(this.recvMessages);
                this.assembleFile();

                //Now we clear it
                this.lastRequest = null;
                this.recvMessages = [];

                if (this.timeout){
                    clearTimeout(this.timeout);
                }
            }
            */
        }
    }
}