import { performance } from "perf_hooks";

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