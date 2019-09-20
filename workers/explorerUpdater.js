/**
 * @author cybor97
 */
const Connectors = require('../connectors');
const sequelizeConnection = require('../data').getConnection();
const Address = require('../data/models/Address');
const Transaction = require('../data/models/Transaction');

const config = require('../config');
const LAST_PATHS_QUERY = `
    SELECT id, originalOpType, path, type
    FROM citadel_core.transactions 
    WHERE id IN (
        SELECT max(id)
        FROM transactions
        WHERE addressId = :addressId
        GROUP BY originalOpType
    );
 `

class ExplorerUpdater {
    static async init() {
        let specificNet = process.argv.find(c => c.match(/^--net=/) && c);
        if (specificNet) {
            specificNet = specificNet.split('--net=')[1];
        }

        this.initConnectors();
        let connectors = this.connectors;
        //TODO: Re-implement: should run as different instances(best: 1-app, 1-updater, N-workers)
        Object.keys(connectors).forEach(net => {
            if (specificNet && net !== specificNet) {
                return;
            }
            Promise.resolve().then(async () => {
                const subscribedAddresses = new Set();
                while (true) {
                    try {
                        let addresses = await Address.findAll({
                            limit: 1,
                            order: [['updated', 'asc']],
                            where: { net: net }
                        });
                        let serviceAddresses = await Address.findAll({
                            order: [['created', 'desc']],
                            where: {
                                isService: true,
                                net: net
                            }
                        });

                        if (addresses.length > 0) {
                            let address = addresses[0];
                            if (connectors[address.net].subscribe) {

                                if (!subscribedAddresses.has(address.address)) {
                                    connectors[address.net]
                                        .subscribe(address.address)
                                        .on('data', data => this.saveDb(address, data));
                                    subscribedAddresses.add(address.address);
                                }
                            }
                            else {
                                await this.doWork(net, connectors[address.net], address, serviceAddresses);
                            }
                            await new Promise(resolve => setTimeout(resolve, config.updateInterval));
                        }
                    }
                    catch (err) {
                        console.error(err);
                        await new Promise(resolve => setTimeout(resolve, config.updateInterval * 2))
                    }
                }
            })
        });
    }

    static async doWork(net, connector, address, serviceAddresses) {
        address.updated = Date.now();
        await address.save();
        let transactions = [];

        let lastPaths = await sequelizeConnection.query(LAST_PATHS_QUERY, {
            replacements: { addressId: address.id },
            type: sequelizeConnection.QueryTypes.SELECT
        });

        if (serviceAddresses.length === 0
            || Date.now() - serviceAddresses[0].updated > config.bakingBadUpdateInterval) {
            if (connector.getServiceAddresses) {
                console.log(`Updating ${net} service addresses`);
                let newServiceAddresses = await connector.getServiceAddresses();
                for (let newServiceAddress of newServiceAddresses) {
                    let created = await Address.findOrCreate({
                        where: { address: newServiceAddress, net: address.net },
                        defaults: {
                            net: address.net,
                            currency: address.currency,
                            address: newServiceAddress,
                            isService: true,
                            created: Date.now(),
                            updated: Date.now()
                        }
                    });
                    if (!created) {
                        Address.update({
                            updated: Date.now()
                        }, {
                            where: { address: newServiceAddress, net: address.net },
                        });
                    }
                }
                if (serviceAddresses.length === 0 && newServiceAddresses.length !== 0) {
                    serviceAddresses = newServiceAddresses.map(c => ({ address: c }));
                }
            }
        }

        console.log(`Updating ${address.address} (${address.net})`);
        if (connector.subscribe) {
            connector.subscribe(address.address);
        }
        transactions = await connector.getAllTransactions(address.address, lastPaths, serviceAddresses.map(c => c.address));
        await this.saveDb(address, transactions);
        return transactions;
    }

    static async saveDb(address, transactions) {
        console.log(`Pushing DB ${address.address} (${address.net}, ${transactions && transactions.length || 0} txes)`);

        const txSqlTransaction = await sequelizeConnection.transaction();
        try {
            await Promise.all(transactions.map(async tx => {
                if (process.argv.includes('-vTX')) {
                    console.log(`>tx: ${tx.hash} (${tx.type})`);
                }
                let forceUpdate = tx.forceUpdate;
                delete tx.forceUpdate;
                if (config.trustedAddresses && tx.type == 'payment' && config.trustedAddresses.includes(tx.from)) {
                    tx.type = 'approved_payment';
                }

                let created = (await Transaction.findOrCreate({
                    where: { hash: tx.hash, addressId: address.id },
                    defaults: Object.assign({ addressId: address.id }, tx),
                    transaction: txSqlTransaction
                }))[1];

                if (forceUpdate && !created) {
                    let transaction = await Transaction.findOne({
                        where: { hash: tx.hash, addressId: address.id }
                    });

                    let newTxData = Object.assign({ addressId: address.id }, tx);
                    for (let key in Object.keys(newTxData)) {
                        transaction.key = newTxData[key];
                    }
                }
            }));
            await txSqlTransaction.commit();
        }
        catch (exc) {
            console.log(`Update failed, rollback ${address.address} (${address.net})`);
            await new Promise(resolve => setTimeout(resolve, config.updateInterval * 2))
            await txSqlTransaction.rollback();
        }
        address.updated = Date.now();
        await address.save();
    }

    static initConnectors() {
        this.connectors = {};
        let connectorsModules = Connectors.getConnectors();
        for (let connectorName in connectorsModules) {
            this.connectors[connectorName] = new (connectorsModules[connectorName])();
        }
    }
}

module.exports = ExplorerUpdater;
