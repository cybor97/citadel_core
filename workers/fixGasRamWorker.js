const Connectors = require('../connectors');
const sequelize = require('sequelize');
const sequelizeConnection = require('../data').getConnection();
const log = require('../utils/log');
const Transaction = require('../data/models/Transaction');

class FixGasRamWorker {
    static async init() {
        let specificNet = process.argv.find(c => c.match(/^--net=/) && c);
        if (specificNet) {
            specificNet = specificNet.split('--net=')[1];
        }

        if (!specificNet) {
            log.err('Net is not specified!');
            process.kill(process.pid);
        }
        this.initConnectors();
        let connectors = this.connectors;

        if (!connectors[net].fixTransactionGasRam) {
            log.err('Net does not require fix!');
            process.kill(process.pid);
        }

        let connector = connectors[net];

        let txCount = await Transaction.count({
            where: {
                gasUsed: { [sequelize.Op.ne]: null }
            }
        });

        for (let i = 0; i < txCount; i++) {
            log.info(`Fixing ${specificNet} tx ${i}/${txCount}`);
            let tx = await Transaction.findOne({
                where: {
                    gasUsed: { [sequelize.Op.ne]: null }
                },
                offset: i,
                limit: txCount
            });

            log.info(`Updating ${tx.hash}`);
            await tx.update(await connector.fixTransactionGasRam(tx.hash));

            log.info(`Saving ${tx.hash}`);
            await tx.save();
        }

        log.info('Done!');
        process.kill(process.pid);
    }

    static initConnectors() {
        this.connectors = {};
        let connectorsModules = Connectors.getConnectors();
        for (let connectorName in connectorsModules) {
            this.connectors[connectorName] = new (connectorsModules[connectorName])();
        }
    }
}
