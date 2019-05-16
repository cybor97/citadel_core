/**
 * @author cybor97
 */

class Connectors {
    static getConnectors() {
        return {
            tez: require('./tez')
        };
    }
}

module.exports = Connectors;