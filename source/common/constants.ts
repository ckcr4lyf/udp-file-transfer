export enum MESSAGES {
    PING = 0x01,
    PONG = 0x02,
    FILE_DOWNLOAD_REQUEST = 0x03,
    FILE_DOWNLOAD_CONTENTS = 0x04,
    FILE_DOWNLOAD_NOT_FOUND = 0x05,
    ACK = 0x20,
};

export enum ACKS {
    STAY = 0x00,
    DOUBLE = 0x01,
    HALF = 0x02,
    COMPLETE = 0x10
}

export enum CONSTANTS {
    SEGMENT_SIZE = 1400
}