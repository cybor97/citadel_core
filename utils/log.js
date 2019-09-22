const LOG_COLORS = {
    info: '\x1b[34m',
    debug: '\x1b[34m',
    warn: '\x1b[33m',
    err: '\x1b[31m',
    reset: '\x1b[0m'
};

class Log {
    static info(text, ...params) {
        this.log(text, ...params);
    }

    static debug(text, ...params) {
        this.log(text, ...params);
    }

    static warn(text, ...params) {
        this.log(text, ...params);
    }

    static err(text, ...params) {
        this.log(text, ...params);
    }

    static log(text, ...params) {
        let caller = this.getStackTrace(this.log)[0].getFunctionName();
        if (['info', 'debug', 'warn', 'err'].includes(caller)) {
            console[caller == 'err' ? 'error' : 'log'](`${caller !== 'info' && LOG_COLORS[caller] || ''}${new Date().toISOString()}`,
                text,
                params && params.map(c =>
                    `\n >${c}`
                ).join() || '', LOG_COLORS['reset']);
        }
        else {
            console.error(text, params);
            console.error('Log function is called from restricted context!');
        }
    }

    static getStackTrace(belowFn) {
        var oldLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = Infinity;

        var dummyObject = {};

        var v8Handler = Error.prepareStackTrace;
        Error.prepareStackTrace = (...params) => params[1];
        Error.captureStackTrace(dummyObject, belowFn || exports.get);

        var v8StackTrace = dummyObject.stack;
        Error.prepareStackTrace = v8Handler;
        Error.stackTraceLimit = oldLimit;

        return v8StackTrace;
    };

}

module.exports = Log;