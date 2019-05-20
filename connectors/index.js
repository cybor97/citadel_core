/**
 * @author cybor97
 */

class Connectors {
    static getConnectors() {
        return {
            tez: require('./tez'),
            orbs: require('./orbs'),
            iost: require('./iost')
        };
    }
}

module.exports = Connectors;