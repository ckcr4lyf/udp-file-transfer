import dgram from 'dgram';
import path from 'path';
import fs from 'fs';
import { MESSAGES } from '../common/constants';
import UDPHeader from '../common/udpHeader';
import { performance } from 'perf_hooks';
import { sleep } from '../common/utilities';
import { SETTINGS } from '../../settings';
import { fileData, fileXfer } from '../common/interfaces';

export default class Server {

    public serverAdress: string;
    public serverPort: number;
    public socket: dgram.Socket;
    public root: string;
    public functionMap: Record<string, Function>;
    public fileData: fileData;
    public fileXfer: fileXfer;

    // public file: Buffer;
    // public windowSize: number;
    // public packetPosition: number;
    // public messageNumber: number;
    // public totalPackets: number;
    // public fullPackets: number;
    // public leftoverSize: number;

    constructor(serverAddress: string, serverPort: number, root: string){
        this.serverAdress = serverAddress;
        this.serverPort = serverPort;
        this.root = root;
        this.socket = dgram.createSocket('udp4');

        this.fileData = {
            totalPackets: 0,
            fullPackets: 0,
            leftoverSize: 0,
            file: Buffer.alloc(0)
        };

        this.fileXfer = {
            windowSize: 0,
            packetPosition: 0,
            messageNumber: 0
        };

        // this.totalPackets = 0;
        // this.fullPackets = 0;
        // this.leftoverSize = 0;
        // this.windowSize = 0;
        // this.packetPosition = 0;
        // this.messageNumber = 0;
        // this.file = Buffer.alloc(0);
        
        this.socket.on('message', this.handleMessage);
        this.socket.bind(serverPort, serverAddress, () => {
            console.log(`Server listening on ${serverAddress}:${serverPort}`);
        });

        this.functionMap = {
            FILE_DOWNLOAD_REQUEST: this.handleFileDowload,
            PING: this.handlePing,
            ACK: this.handleAck
        }
    }

    handleMessage = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        console.log(`Incoming message from ${rinfo.address}:${rinfo.port}`);
        const header = UDPHeader.fromBinary(msg.slice(0, 10));
        // console.log(MESSAGES[header.messageType]);

        try {
            this.functionMap[MESSAGES[header.messageType]](msg, header, rinfo);
        } catch (error){
            console.log('Invalid message type!');
        }
    }

    handlePing = (msg: Buffer, header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        const responseHeader = new UDPHeader(header.messageNumber + 1, 0x01, 0x01, MESSAGES.PONG, 0x00, 0x00);
        // const packet = Buffer.concat([responseHeader.asBinary()]);
        console.log(`Replying to ping with pong!`);
        this.socket.send(responseHeader.asBinary(), rinfo.port, rinfo.address);
    }

    handleAck = (msg: Buffer, header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        this.fileXfer.windowSize = this.fileXfer.windowSize * 2; //TODO: Linear as an alternative if a flag is set?
        if (this.fileXfer.packetPosition + this.fileXfer.windowSize > this.fileData.totalPackets){
            this.fileXfer.windowSize = (this.fileData.totalPackets - this.fileXfer.packetPosition) + 1;
        }
        console.log(`Received an ACK! Changed windowSize to ${this.fileXfer.windowSize}`);
        this.sendWindow(header, rinfo);
    }

    sendWindow = (header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        //Loop for i from position
        //Upto the windowLength
        //Prepare packets
        //Send them
        //Update packet position
        //TODO: Logic to resend

        for (let i = 0; i < this.fileXfer.windowSize; i++){
            const packetNumber = this.fileXfer.packetPosition + i;
            const fileSeek = packetNumber * 1400;
            const payload = this.fileData.file.slice(fileSeek, fileSeek + 1400);
            const responseHeader = new UDPHeader(this.fileXfer.messageNumber, packetNumber, this.fileData.totalPackets, MESSAGES.FILE_DOWNLOAD_CONTENTS, 0x00, payload.length);
            const packet = Buffer.concat([responseHeader.asBinary(), payload]);
            this.socket.send(packet, rinfo.port, rinfo.address);
        }

        this.fileXfer.packetPosition += this.fileXfer.windowSize;
    }

    handleFileDowload = async (msg: Buffer, header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        const filename = msg.slice(10, 10 + header.dataLength);
        const filepath = path.join(this.root, filename.toString());

        if (!fs.existsSync(filepath)){
            return; //Just no response for now
        }

        const size = fs.statSync(filepath).size;
        const file = fs.readFileSync(filepath);
        const fullPackets = Math.floor(size / 1400);
        const leftoverSize = size % 1400;
        let totalPackets = fullPackets;

        if (leftoverSize !== 0){
            totalPackets += 1;
        }

        this.fileData = { totalPackets, fullPackets, leftoverSize, file };
        this.fileXfer = {
            windowSize: 5, //TODO: Handle case where filesize needs less than windowsize packets
            packetPosition: 1,
            messageNumber: header.messageNumber + 1
        };

        // this.packetPosition = 1;
        // this.windowSize = 5;
        // this.fullPackets = fullPackets;
        // this.leftoverSize = leftoverSize;
        // this.messageNumber = header.messageNumber + 1;
        // this.file = file;
        // this.totalPackets = totalPackets;

        console.log(`We have ${fullPackets} full sized packets, and leftover packet of size ${leftoverSize}`);
        this.sendWindow(header, rinfo);
        return;
        
        const t1 = performance.now();

        //We send window length worth of packets.

        for (let i = 0; i < fullPackets; i++){
            const position = i * 1400;
            const payload = file.slice(position, position + 1400);
            const responseHeader = new UDPHeader(header.messageNumber + 1, i + 1, totalPackets, MESSAGES.FILE_DOWNLOAD_CONTENTS, 0x00, 1400);
            const packet = Buffer.concat([responseHeader.asBinary(), payload]);
            // console.log(packet);
            this.socket.send(packet, rinfo.port, rinfo.address);
            if (i % SETTINGS.SEND_INTERVAL_COUNT === 0){
                //Artificial sleep
                await sleep(SETTINGS.SEND_INTERVAL_TIME);
            }
        }

        if (leftoverSize !== 0){
            const position = fullPackets * 1400;
            const payload = file.slice(position, position + leftoverSize);
            const responseHeader = new UDPHeader(header.messageNumber + 1, totalPackets, totalPackets, MESSAGES.FILE_DOWNLOAD_CONTENTS, 0x00, leftoverSize);
            const packet = Buffer.concat([responseHeader.asBinary(), payload]);
            // console.log(packet);
            this.socket.send(packet, rinfo.port, rinfo.address);
        }

        const duration = performance.now() - t1;
        console.log(`Sent ${totalPackets} packets totalling ${size} bytes in ${duration.toFixed(2)}ms.`);
    }
}