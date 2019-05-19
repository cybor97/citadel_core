/**
 * @author cybor97
 */

class Connectors {
    static getConnectors() {
        return {
            tez: require('./tez'),
            orbs: require('./orbs')
        };
    }
}

module.exports = Connectors;