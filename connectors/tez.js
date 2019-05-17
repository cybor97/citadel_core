const axios = require('axios');
const BaseConnector = require('./baseConnector');

const THRESHOLD = 1000 * 60 * 60 * 12;//6 hours in ms
const REWARDS_INTERVAL = 1000 * 60 * 60 * 24 * 3;//3 days in ms
const MIN_CONFIDENCE_COUNT = 3;//tx count with date diff <= THRESHOLD
const OP_TYPES = {
    supplement: 'Transaction',
    delegation: 'Delegation',
}

//TODO: Implement conclusion
class TEZ extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://api6.tzscan.io/v3';
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address){
        let result = {};
        for(let key in OP_TYPES){
            let transactionsCount = (await axios.get(`${this.apiUrl}/number_operations/${address}`, {
                params: {
                    type: OP_TYPES[key]
                }
            })).data[0];
            let transactions = [];
            let offset = 0;
            while(transactions.length < transactionsCount){
                transactions = transactions.concat((await axios.get(`${this.apiUrl}/operations/${address}`,{
                    params: {
                        type: OP_TYPES[key],
                        number: transactionsCount,
                        p: offset
                    }
                }))
                    .data
                    .map(tx => {                        
                        let txData = tx.type.operations[0];
                        return {
                            hash: tx.hash,
                            date: Date.parse(txData.timestamp),
                            value: txData.amount,
                            from: txData.src.tz,
                            fromAlias: txData.src.tz,
                            to: (txData.destination||txData.delegate).tz,
                            fee: txData.fee,
                            type: key
                        };
                    })
                );            
                offset++;
            }

            result[key] = transactions;
        }

        //Unprocessed payments/conclusions are supplements by default
        this.processPayment(result.supplement);

        return [].concat(...Object.values(result));
    }

    async processPayment(transactions){
        let txData = transactions.reduce((data, tx) => {
            //TODO: Review
            if(data[tx.fromAlias]){
                data[tx.from] = -1;
            }
            if(data[tx.fromAlias] !== -1){
                if(data[tx.from] === undefined){
                    data[tx.from] = [];
                }
                data[tx.from].push(tx.date);    
            }
            return data;
        }, {});

        let rewardAddresses = Object.keys(txData)
            .filter(key => {
                let dates = txData[key];
                if(txData[key] === -1){
                    return true;
                }

                if(dates.length >= MIN_CONFIDENCE_COUNT){
                    dates.sort();
                    let countOk = 0;
                    for(let i = 1; i < dates.length; i++){
                        if(Math.abs((dates[i] - dates[i - 1]) - REWARDS_INTERVAL) <= THRESHOLD){
                            if(++countOk >= 3){
                                break;
                            }
                        }
                        else {
                            countOk = 0;
                        };
                    }

                    return countOk >= 3;
                }
                return false;
            });
        transactions.forEach(tx=>{
            if(rewardAddresses.indexOf(tx.from) != -1){
                tx.type = 'payment';
            }
        });
    }

    async processConclusion(delegations){

    }
}

module.exports = TEZ;