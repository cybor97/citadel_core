/**
 * @author cybor97
 */

class Connectors {
    static getConnectors() {
        return {
            tez: require('./tez'),
            orbs: require('./orbs'),
            iost: require('./iost'),
            nuls: require('./nuls'),
            atom: require('./atom')
        };
    }
}

module.exports = Connectors;