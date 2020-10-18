import UDPHeader from "../common/udpHeader";
import { MESSAGES } from '../common/constants';
import dgram from 'dgram';
import { message } from "../common/interfaces";

const TIME_LIMIT = 5000;

export default class Peer {

    public serverAddress: string;
    public serverPort: number;
    public socket: dgram.Socket;
    public timeout: null | NodeJS.Timeout;
    public lastRequest: null | message;
    public recvMessages: message[];

    constructor(serverAddress: string, serverPort: number) {
        this.serverAddress = serverAddress;
        this.serverPort = serverPort;
        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', this.handleMessage);
        this.timeout = null;
        this.lastRequest = null;
        this.recvMessages = [];
        // this.socket.connect(serverPort, serverAddress);
        // this.socket.on('connect', () => {
        //     console.log('Connected to server!');
        //     // this.socket.send('YOLO');
        // })
    }

    requestFile = (filename: string) => {
        const header = new UDPHeader(null, 0x01, 0x01, MESSAGES.FILE_DOWNLOAD_REQUEST, 0x00, filename.length);
        const payload = Buffer.from(filename);
        const packet = Buffer.concat([header.asBinary(), payload]);
        console.log(`Prepared packet`, packet);
        this.lastRequest = { header, payload };
        this.socket.send(packet, this.serverPort, this.serverAddress);
        this.timeout = setTimeout(this.handleTimeout, TIME_LIMIT);
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
        console.log(`Incoming message from ${rinfo.address}:${rinfo.port}`);
        const header = UDPHeader.fromBinary(msg.slice(0, 10));

        if (this.lastRequest && (this.lastRequest.header.messageNumber + 1 === header.messageNumber)){
            if (this.lastRequest.header.messageType === MESSAGES.FILE_DOWNLOAD_REQUEST){
                this.handleFileResponse(msg, header, rinfo);
            }
        }       
    }

    assembleFile = () => {

        //We have some (or all) data in recvMessages[]
        //We have info like filesize in it?
        const totalPackets = this.recvMessages[0].header.totalPackets;
        const buffer = Buffer.alloc(totalPackets * 1400);
        let minCopied = 1400;
        let percent = (this.recvMessages.length / totalPackets) * 100;
        console.log(`Recevied ${this.recvMessages.length}/${totalPackets}! (${percent.toFixed(2)}%)`);
        console.log(`Filename is ${this.lastRequest?.payload.toString()}`);

        for (let i = 0; i < this.recvMessages.length; i++){
            const position = i * 1400;
            const bytesCopied = this.recvMessages[i].payload.copy(buffer, position, 0);
            console.log(`Copied ${bytesCopied} bytes for packet #${this.recvMessages[i].header.packetNumber}`);
            if (bytesCopied < 1400){
                minCopied = bytesCopied;
            }
        }

        //We can delete the last (1400 - minCopied)
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
        } else {
            const message: message = {
                header: header,
                payload: msg.slice(10)
            };

            this.recvMessages.push(message);

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
        }
    }
}