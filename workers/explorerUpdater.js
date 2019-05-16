/**
 * @author cybor97
 */
const Connectors = require('../connectors');
const Address = require('../data/models/Address');
const Transaction = require('../data/models/Transaction');

class ExplorerUpdater {
    static init(){
        let connectors = Connectors.getConnectors();
        setInterval(() => {
            let addresses = Address.findAll({
                limit: 1,
                order: [['lastUpdate', 'desc']]
            });
            if(addresses.length > 0){
                let address = address[0];
                let transactions = connectors[address.net].getTransactions(address);
                transactions.forEach(tx => {
                    Transaction.findOrCreate({
                        where: {hash: tx.hash},
                        defaults: Object.assign({addressId: address.id}, tx)
                    });
                })
            }
        }, 1000);
    }
}