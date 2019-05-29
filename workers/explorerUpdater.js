/**
 * @author cybor97
 */
const Connectors = require('../connectors');

const sequelize = require('../data').getConnection();
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
        //TODO: Re-implement: should run as different instance with cron
        Promise.resolve().then(async () => {
            while(true){
                try{
                    let addresses = await Address.findAll({
                        limit: 1,
                        order: [['updated', 'asc'], ['created', 'desc']]
                    });

                    if(addresses.length > 0){
                        let address = addresses[0];
                        let lastPaths = await sequelize.query(LAST_PATHS_QUERY, {
                            replacements: {addressId: address.id},
                            type: sequelize.QueryTypes.SELECT
                        });
                        console.log(`Updating ${address.address} (${address.net})`);

                        //TODO: Should 'update' just new data
                        let transactions = await connectors[address.net].getAllTransactions(address.address, lastPaths);
                        for(let tx of transactions){
                            console.log(`>tx: ${tx.hash}`);
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
                    console.log(err);
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