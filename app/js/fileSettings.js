module.exports = class FileSettings {
    constructor() {
        this.severity = {};

        this.severity.trace = {
            show: true
        };

        this.severity.debug = {
            show: true
        };

        this.severity.info = {
            show: true
        };

        this.severity.warning = {
            show: true
        };

        this.severity.error = {
            show: true
        };

        this.tags = {};
    }

    addTag(tag) {
        this.tags[tag] = {show: true};
    }

    hasTag(tag) {
        return this.tags[tag] === undefined;
    }

    getLogTagsToShow() {
        return Object.keys(this.tags).filter(tag => this.tags[tag].show);
    }

    getAllLogTags() {
        return Object.keys(this.tags);
    }

    setLogTagsToShow(logTagsToShow) {
        for (let tag in this.tags) {
            this.tags[tag].show = false;
        }

        logTagsToShow.forEach(tag => this.tags[tag.toLowerCase()].show = true);
    }

    static createFromSettings(settings) {
        return Object.assign(new FileSettings(), settings);
    }

    getLogLevelsToShow() {
        return Object.keys(this.severity).filter(severity => this.severity[severity].show);
    }

    setLogLevelsToShow(logLevelsToShow) {
        for (let severity in this.severity) {
            this.severity[severity].show = false;
        }

        logLevelsToShow.forEach(severity => this.severity[severity.toLowerCase()].show = true);
    }
}