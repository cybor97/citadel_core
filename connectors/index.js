/**
 * @author cybor97
 */

class Connectors {
    static getConnectors() {
        return {
            tez: require('./connectors/tez'),
            orbs: require('./connectors/orbs'),
            iost: require('./connectors/iost'),
            'iost-coin': require('./connectors/iost-coin'),
            nuls: require('./connectors/nuls'),
            atom: require('./connectors/atom'),
            icon: require('./connectors/icon')
        };
    }
}

module.exports = Connectors;