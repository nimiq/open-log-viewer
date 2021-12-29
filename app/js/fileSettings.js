module.exports = class FileSettings {
    constructor() {
        this.trace = {
            show: true
        };

        this.debug = {
            show: true
        };

        this.info = {
            show: true
        };

        this.warning = {
            show: true
        };

        this.error = {
            show: true
        };
    }

    static createFromSettings(settings) {
        return Object.assign(new FileSettings(), settings);
    }

    getLogLevelsToShow() {
        return Object.keys(this).filter(severity => this[severity].show);
    }

    setLogLevelsToShow(logLevelsToShow) {
        for (let severity in this) {
            this[severity].show = false;
        }

        logLevelsToShow.forEach(severity => this[severity.toLowerCase()].show = true);
    }
}