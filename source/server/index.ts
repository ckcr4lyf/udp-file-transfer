import dgram from 'dgram';
import path from 'path';
import fs from 'fs';
import { ACKS, MESSAGES } from '../common/constants';
import UDPHeader from '../common/udpHeader';
import { performance } from 'perf_hooks';
import { sleep } from '../common/utilities';
import { SETTINGS } from '../../settings';
import { fileData, fileXfer } from '../common/interfaces';
import { Logger } from '../common/logger';

const logger = new Logger(2);

export default class Server {

    public serverAdress: string;
    public serverPort: number;
    public socket: dgram.Socket;
    public root: string;
    public functionMap: Record<string, Function>;
    public fileData: fileData;
    public fileXfer: fileXfer;

    constructor(serverAddress: string, serverPort: number, root: string){

        logger.debug(`Starting server constructor...`);
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
        
        this.socket.on('message', this.handleMessage);

        this.socket.on('error', (socketError: NodeJS.ErrnoException) => {
            if (socketError.code === 'EADDRINUSE'){
                logger.error(`Failed to bind to ${serverAddress}:${serverPort} since it is in use.`);
                process.exit(1);
            } else {
                console.log(`Socket encountered an error`, socketError, socketError.name);
            }
        });

        this.socket.bind(serverPort, serverAddress, () => {
            logger.info(`Server listening on ${serverAddress}:${serverPort}`);
        });

        this.functionMap = {
            FILE_DOWNLOAD_REQUEST: this.handleFileDowload,
            PING: this.handlePing,
            ACK: this.handleAck
        }
    }

    handleMessage = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        logger.debug(`Incoming message from ${rinfo.address}:${rinfo.port}`);
        const header = UDPHeader.fromBinary(msg.slice(0, 10));

        try {
            this.functionMap[MESSAGES[header.messageType]](msg, header, rinfo);
        } catch (error){
            logger.warn('Invalid message type!');
        }
    }

    handlePing = (msg: Buffer, header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        const responseHeader = new UDPHeader(header.messageNumber + 1, 0x01, 0x01, MESSAGES.PONG, 0x00, 0x00);
        logger.debug(`Replying to ping with pong!`);
        this.socket.send(responseHeader.asBinary(), rinfo.port, rinfo.address);
    }

    handleAck = (msg: Buffer, header: UDPHeader, rinfo: dgram.RemoteInfo) => {


        //TODO: An ack which retransmits the window?

        // Check the ACK flag
        let multiplier = 1;

        if (header.ACKS_VALUE === ACKS.DOUBLE){
            multiplier *= 2;
            logger.debug(`Received a DOUBLE ACK! Changed windowSize to ${this.fileXfer.windowSize * multiplier}`);
        } else if (header.ACKS_VALUE === ACKS.STAY){
            // Do nothing
            logger.debug(`Received a STAY ACK! Keeping window size as ${this.fileXfer.windowSize}`);
        } else if (header.ACKS_VALUE === ACKS.HALF){
            if (this.fileXfer.windowSize % 2 === 0){
                multiplier = 0.5;
                logger.debug(`Received a HALF ACK! Changed window size as ${this.fileXfer.windowSize * multiplier}`);
            } else {
                logger.debug('Window size is odd, will keep multiplier to 1.');
            }
        }

        this.fileXfer.windowSize = this.fileXfer.windowSize *  multiplier; //TODO: Linear as an alternative if a flag is set? Or custom window size even
        if (this.fileXfer.packetPosition + this.fileXfer.windowSize > this.fileData.totalPackets){
            this.fileXfer.windowSize = (this.fileData.totalPackets - this.fileXfer.packetPosition) + 1;
        }
        this.sendWindow(header, rinfo);
    }

    sendWindow = (header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        //Loop for i from position
        //Upto the windowLength
        //Prepare packets
        //Send them
        //Update packet position
        //TODO: Logic to resend

        const packetsLeft = this.fileData.totalPackets - this.fileXfer.packetPosition + 1;

        if (packetsLeft < this.fileXfer.windowSize){
            this.fileXfer.windowSize = packetsLeft;
        } else if (packetsLeft === 0){
            console.log(`Finished file transfer!!!`);
            return;
        }

        for (let i = 0; i < this.fileXfer.windowSize; i++){
            const packetNumber = this.fileXfer.packetPosition + i;
            logger.trace(`Set packet number to ${packetNumber}`);
            const fileSeek = (packetNumber - 1) * 1400;
            const payload = this.fileData.file.slice(fileSeek, fileSeek + 1400);
            const responseHeader = new UDPHeader(this.fileXfer.messageNumber, packetNumber, this.fileData.totalPackets, MESSAGES.FILE_DOWNLOAD_CONTENTS, 0x00, payload.length);
            const packet = Buffer.concat([responseHeader.asBinary(), payload]);
            
            //Introduce a bit of a random delay, to send packets out of order
            //Useful for localhost testing.
            this.socket.send(packet, rinfo.port, rinfo.address);
            // const delay = Math.floor(Math.random() * 100);
            // setTimeout(() => {
            //     this.socket.send(packet, rinfo.port, rinfo.address);
            // }, delay)
        }

        this.fileXfer.packetPosition += this.fileXfer.windowSize;
    }

    handleFileDowload = async (msg: Buffer, header: UDPHeader, rinfo: dgram.RemoteInfo) => {
        const filename = msg.slice(10, 10 + header.dataLength);
        const filepath = path.join(this.root, filename.toString());

        if (!fs.existsSync(filepath)){
            logger.error(`File does not exist! Requested filename: [${filename}], converted to filepath: [${filepath}]`);
            return; //Ignore for now
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

        logger.info(`We have ${fullPackets} full sized packets, and leftover packet of size ${leftoverSize}`);
        this.sendWindow(header, rinfo);
        return;
    }
}