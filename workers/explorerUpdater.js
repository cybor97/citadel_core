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
    static init(){
        this.initConnectors();
        let connectors = this.connectors;
        //TODO: Re-implement: should run as different instances(best: 1-app, 1-updater, N-workers)
        Promise.resolve().then(async () => {
            while(true){
                try{
                    let addresses = await Address.findAll({
                        limit: 1,
                        order: [['updated', 'asc'], ['created', 'desc']],
                        where: {
                            isService: false
                        }
                    });
                    let serviceAddresses = await Address.findAll({
                        order: [['created', 'desc']],
                        where: {
                            isService: true
                        }
                    });

                    if(addresses.length > 0){
                        let address = addresses[0];
                        let lastPaths = await sequelizeConnection.query(LAST_PATHS_QUERY, {
                            replacements: {addressId: address.id},
                            type: sequelizeConnection.QueryTypes.SELECT
                        });
                        let connector = await connectors[address.net];
                        if(serviceAddresses.length === 0 
                            || Date.now() - serviceAddresses[0].updated > config.bakingBadUpdateInterval){
                            if(connector.getServiceAddresses){
                                let newServiceAddresses = await connector.getServiceAddresses();
                                for(let newServiceAddress of newServiceAddresses){
                                    let created = await Address.findOrCreate({
                                        where: {address: newServiceAddress, net: address.net},
                                        defaults: {
                                            net: address.net,
                                            currency: address.currency,
                                            address: newServiceAddress,
                                            isService: true,
                                            created: Date.now(),
                                            updated: Date.now()
                                        }
                                    });
                                    if(!created){
                                        Address.update({
                                            updated: Date.now()
                                        }, {
                                            where: {address: newServiceAddress, net: address.net},
                                        });
                                    }
                                }
                                if(serviceAddresses.length === 0 && newServiceAddresses.length !== 0){
                                    serviceAddresses = newServiceAddresses.map(c => ({address: c}));
                                }
                            }
                        }

                        console.log(`Updating ${address.address} (${address.net})`);
                        let transactions = await connector.getAllTransactions(address.address, lastPaths, serviceAddresses.map(c => c.address));

                        for(let tx of transactions){
                            console.log(`>tx: ${tx.hash} (${tx.type})`);
                            let forceUpdate = tx.forceUpdate;
                            delete tx.forceUpdate;

                            let created = (await Transaction.findOrCreate({
                                where: {hash: tx.hash, addressId: address.id},
                                defaults: Object.assign({addressId: address.id}, tx)
                            }))[1];

                            if(forceUpdate && !created){
                                let transaction = await Transaction.findOne({
                                    where: {hash: tx.hash, addressId: address.id}
                                });
                                
                                let newTxData = Object.assign({addressId: address.id}, tx);
                                for(let key in Object.keys(newTxData)){
                                    transaction.key = newTxData[key];
                                }

                                await transaction.save();
                            }
                        }
                        address.updated = Date.now();
                        await address.save();
                        await new Promise(resolve => setTimeout(resolve, config.updateInterval))
                    }
                }
                catch(err){
                    console.error(err);
                }
            }
        });
    }

    static initConnectors(){
        this.connectors = {};
        let connectorsModules = Connectors.getConnectors();
        for(let connectorName in connectorsModules){
            this.connectors[connectorName] = new (connectorsModules[connectorName])();
        }
    }
}

module.exports = ExplorerUpdater;