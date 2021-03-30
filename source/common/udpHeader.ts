import { ACKS, MESSAGES } from './constants';

export default class UDPHeader {
    public messageNumber: number;
    public packetNumber: number;
    public totalPackets: number;
    public messageType: MESSAGES;
    public flags: number;
    public dataLength: number;
    public ACKS_VALUE: ACKS;

    constructor(messageNumber: number | null, packetNumber: number, totalPackets: number, messageType: MESSAGES, flags: number, dataLength: number){
        
        if (messageNumber === null){
            this.messageNumber = Math.floor(Math.random() * 0xFFFF);
        } else {
            this.messageNumber = messageNumber;
        }

        this.packetNumber = packetNumber;
        const uint16_t = Buffer.alloc(2);
        uint16_t.writeUInt16BE(packetNumber);
        this.ACKS_VALUE = uint16_t.slice(0, 1).readUInt8(); //Only used if the message type is ACK, but always parsed.
        //IDEA - totalPackets (2 byte) represents how many we want in next window?
        // console.log(`ACKS_VALUE is ${this.ACKS_VALUE} and key is ${ACKS[this.ACKS_VALUE]}`);
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

    /**
     * Get the numeric value of two uint8 concatenated as a single uint16.
     * Useful for supplying two values for ACKs instead of packetNumber
     * @param byte0 The first byte (0-255)
     * @param byte1 The second byte (0-255)
     */
    static makeUInt16 = (byte0: number, byte1: number) => {
        return Buffer.from([byte0, byte1]).readUInt16BE();
    }
}