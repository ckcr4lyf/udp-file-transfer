import { MESSAGES } from './constants';

export default class UDPHeader {
    public messageNumber: number;
    public packetNumber: number;
    public totalPackets: number;
    public messageType: MESSAGES;
    public flags: number;
    public dataLength: number;

    constructor(messageNumber: number | null, packetNumber: number, totalPackets: number, messageType: MESSAGES, flags: number, dataLength: number){
        
        if (messageNumber === null){
            this.messageNumber = Math.floor(Math.random() * 0xFFFF);
        } else {
            this.messageNumber = messageNumber;
        }

        this.packetNumber = packetNumber;
        this.totalPackets = totalPackets;
        this.messageType = messageType;
        this.flags = flags;
        this.dataLength = dataLength;
    }

    asBinary = (): Buffer => {
        const binaryHeader = Buffer.alloc(10);
        binaryHeader.writeUInt16BE(this.messageNumber, 0);
        binaryHeader.writeUInt16BE(this.packetNumber, 2);
        binaryHeader.writeUInt16BE(this.totalPackets, 4);
        binaryHeader.writeUInt8(this.messageType, 6);
        binaryHeader.writeUInt8(this.flags, 7);
        binaryHeader.writeUInt16BE(this.dataLength, 8);
        return binaryHeader;
    }

    static fromBinary = (headerSlice: Buffer): UDPHeader => {
        return new UDPHeader(headerSlice.readUInt16BE(0), headerSlice.readUInt16BE(2), headerSlice.readUInt16BE(4), headerSlice.readUInt8(6), headerSlice.readUInt8(7), headerSlice.readUInt16BE(8));
    }
}