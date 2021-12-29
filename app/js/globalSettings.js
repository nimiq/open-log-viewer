module.exports = class GlobalSettings {
    constructor(settings) {
        this.fontSize = "15";

        this.trace = {
            textColor: "#3B1051",
            backgroundColor: "rgba(235, 206, 254, 0.9)",
            pattern: "TRACE"
        };

        this.debug = {
            textColor: "#132554",
            backgroundColor: "rgba(203, 217, 254, 0.9)",
            pattern: "DEBUG"
        };

        this.info = {
            textColor: "#093714",
            backgroundColor: "rgba(212, 237, 218, 0.9)",
            pattern: "INFO"
        };

        this.warning = {
            textColor: "#413207",
            backgroundColor: "rgba(255, 193, 7, 0.9)",
            pattern: "WARN"
        };

        this.error = {
            textColor: "#64171E",
            backgroundColor: "rgba(246, 115, 115, 0.9)",
            pattern: "ERROR"
        };

        if (settings) {
            Object.assign(this, settings);
        }
    }
}