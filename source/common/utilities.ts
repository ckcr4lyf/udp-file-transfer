import crypto from 'crypto';
import { performance } from "perf_hooks";
import dgram from 'dgram';

export const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
}

export class timeInterval {
    public t1: number;
    public t2: number;

    constructor(){
        this.t1 = -1;
        this.t2 = -1;
    }

    start = () => {
        this.t1 = performance.now();
    }

    end = () => {
        this.t2 = performance.now();
    }

    currentDuration = () => {
        return performance.now() - this.t1;
    }

    getInterval = () => {
        return this.t2 - this.t1;
    }

    asString = (precision?: number) => {
        if (precision){
            return this.getInterval().toFixed(precision);
        } else {
            return this.getInterval().toFixed(2); //Default is 2
        }
    }
}

export const remoteInfoToHash = (remoteInfo: dgram.RemoteInfo): string => {
    const hash = crypto.createHash('sha1');
    hash.update(remoteInfo.address);
    hash.update(remoteInfo.port.toString());
    return hash.digest('hex');
}

export const ipPortToHash = (ip: string, port: number): string => {
    const hash = crypto.createHash('sha1');
    hash.update(ip);
    hash.update(port.toString());
    return hash.digest('hex');
}