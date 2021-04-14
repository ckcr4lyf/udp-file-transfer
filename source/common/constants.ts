export enum MESSAGES {
    PING = 0x01,
    PONG = 0x02,
    FILE_DOWNLOAD_REQUEST = 0x03,
    FILE_DOWNLOAD_CONTENTS = 0x04,
    FILE_DOWNLOAD_NOT_FOUND = 0x05,
    ACK = 0x20,
    MANIFEST_REQUEST = 0x30,
    MANIFEST_RESPONSE = 0x31,
    HANDSHAKE_REQUEST = 0x41,
    HANDSHAKE_RESPONSE = 0x42,
    PEERLIST_REQUEST = 0x43,
    PEERLIST_RESPONSE = 0x44,
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

export enum STATUS {
    HAVE = 0x01,
    DONT_HAVE = 0x02,
    QUEUED = 0x03,
    DOWNLOADING = 0x04,
}

export enum JOB_STATUS {
    CREATED = 0x01,
    QUEUED = 0x02,
    DOWNLOADING = 0x03,
    COMPLETED = 0x04,
    FAILED = 0x05, // TBD - If this is possible
}

export enum PEER_STATUS {
    AVAILABLE = 0x01,
    BUSY = 0x02,
}