enum LOGLEVELS {
    TRACE = 0,
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
}

export class Logger {

    public logLevel: number;

    constructor(logLevel: number){
        this.logLevel = logLevel;
    }

    private log(level: string, msg: string){
        const dateString = new Date().toISOString();
        console.log(`[${dateString}] ${level}: ${msg}`);
    }

    public trace(msg: string){
        if (this.logLevel <= LOGLEVELS.TRACE){
            this.log('TRACE', msg);
        }
    }

    public debug(msg: string){
        if (this.logLevel <= LOGLEVELS.DEBUG){
            this.log('DEBUG', msg);
        }
    }

    public info(msg: string){
        if (this.logLevel <= LOGLEVELS.INFO){
            this.log('INFO', msg);
        }
    }

    public warn(msg: string){
        if (this.logLevel <= LOGLEVELS.WARN){
            this.log('WARN', msg);
        }
    }

    public error(msg: string){
        if (this.logLevel <= LOGLEVELS.ERROR){
            this.log('ERROR', msg);
        }
    }
}