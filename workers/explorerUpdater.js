/**
 * @author cybor97
 */
const Connectors = require('../connectors');
const DBConnection = require('../data/index');
const Address = require('../data/models/Address');
const Transaction = require('../data/models/Transaction');

const config = require('../config');

class ExplorerUpdater {
    static init(){
        let connectors = Connectors.getConnectors();

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
                    console.log(`Updating address "${address.address}"(net "${address.net}")`);
                    //TODO: Should 'update' just new data
                    let transactions = await (new connectors[address.net]()).getAllTransactions(address.address);
                    for(let tx of transactions){
                        console.log(`>tx: ${tx.hash}`);
                        let forceUpdate = tx.forceUpdate;
                        delete tx.forceUpdate;

                        let created = (await Transaction.findOrCreate({
                            where: {hash: tx.hash, addressId: address.id},
                            defaults: Object.assign({addressId: address.id}, tx)
                        }))[1];

                        if(tx.forceUpdate && !created){
                            await Transaction.update(Object.assign({addressId: address.id}, tx), {
                                where: {hash: tx.hash, addressId: address.id},
                            });
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
}

module.exports = ExplorerUpdater;