import dgram from 'dgram';
import path from 'path';
import fs from 'fs';
import { MESSAGES } from '../common/constants';
import UDPHeader from '../common/udpHeader';
import { performance } from 'perf_hooks';
import { sleep } from '../common/utilities';

export default class Server {

    public serverAdress: string;
    public serverPort: number;
    public socket: dgram.Socket;
    public root: string;
    public functionMap: Record<string, Function>;

    constructor(serverAddress: string, serverPort: number, root: string){
        this.serverAdress = serverAddress;
        this.serverPort = serverPort;
        this.root = root;
        this.socket = dgram.createSocket('udp4');
        
        this.socket.on('message', this.handleMessage);
        this.socket.bind(serverPort, serverAddress, () => {
            console.log(`Server listening on ${serverAddress}:${serverPort}`);
        });

        this.functionMap = {
            FILE_DOWNLOAD_REQUEST: this.handleFileDowload
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

    handleFileDowload = async (msg: Buffer, header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        const filename = msg.slice(10, 10 + header.dataLength);
        const filepath = path.join(this.root, filename.toString());
        // console.log(filepath);
        //Let's assume file exists.
        if (!fs.existsSync(filepath)){
            return; //Just no response for now
        }
        const size = fs.statSync(filepath).size;
        const file = fs.readFileSync(filepath);
        let totalPackets = 0;
        let fullPackets = Math.floor(size / 1400);
        let leftoverSize = size % 1400;
        totalPackets = fullPackets;
        if (leftoverSize !== 0){
            totalPackets += 1;
        }

        console.log(`We have ${fullPackets} full sized packets, and leftover packet of size ${leftoverSize}`);
        const t1 = performance.now();

        for (let i = 0; i < fullPackets; i++){
            const position = i * 1400;
            const payload = file.slice(position, position + 1400);
            const responseHeader = new UDPHeader(header.messageNumber + 1, i + 1, totalPackets, MESSAGES.FILE_DOWNLOAD_CONTENTS, 0x00, 1400);
            const packet = Buffer.concat([responseHeader.asBinary(), payload]);
            // console.log(packet);
            this.socket.send(packet, rinfo.port, rinfo.address);
            if (i % 100 === 0){
                //Artificial sleep
                await sleep(20);
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