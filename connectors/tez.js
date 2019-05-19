const axios = require('axios');
const BaseConnector = require('./baseConnector');

const THRESHOLD = 1000 * 60 * 60 * 12;//6 hours in ms
const REWARDS_INTERVAL = 1000 * 60 * 60 * 24 * 3;//3 days in ms
const MIN_CONFIDENCE_COUNT = 3;//tx count with date diff <= THRESHOLD
const M_TEZ_MULTIPLIER = 1000000;
const OP_TYPES = [
    {type: 'origination', sourceType: 'Origination'},
    {type: 'supplement', sourceType: 'Transaction'},
    {type: 'payment', sourceType: 'Delegation'},
]

//TODO: Implement conclusion
class TEZ extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://api6.tzscan.io/v3';
    }

    /**
     * Get start with
     * @param {String} address 
     * @param {Array} lastPaths Last paths as {OriginalType:offset}
     */
    async getStartWith(address, lastPaths = null){
        let startWith = {origination: 0, supplement: 0, payment: 0};
        if(lastPath === null || lastPaths.length === 0){
            return startWith;
        }

        for(let opType of OP_TYPES){
            let transactionsCount = (await axios.get(`${this.apiUrl}/number_operations/${address}`, {
                params: {
                    type: opType.sourceType
                }
            })).data[0];
            let lastPathOffset = lastPaths[opType.sourceType];
            if(lastPathOffset < transactionsCount - 1){
                startWith[opType.type] = transactionsCount - lastPathOffset - 1;
            }
        }
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, startWith = {origination: 0, supplement: 0, payment: 0}){
        let result = {};
        for(let opType of OP_TYPES){
            let transactionsCount = (await axios.get(`${this.apiUrl}/number_operations/${address}`, {
                params: {
                    type: opType.sourceType
                }
            })).data[0];
            let transactions = [];
            let offset = startWith[opType.type];
            while(transactions.length < transactionsCount){
                transactions = transactions.concat((await axios.get(`${this.apiUrl}/operations/${address}`,{
                    params: {
                        type: opType.sourceType,
                        number: transactionsCount,
                        p: offset
                    }
                }))
                    .data
                    .map(tx => {                        
                        let txData = tx.type.operations[0];
                        let toField = txData.destination || txData.delegate || txData.tz1;
                        let to = toField ? toField.tz : null;

                        return {
                            hash: tx.hash,
                            date: Date.parse(txData.timestamp),
                            value: (txData.amount||txData.balance) / M_TEZ_MULTIPLIER,
                            from: txData.src.tz,
                            fromAlias: txData.src.tz,
                            to: to,
                            fee: txData.fee / M_TEZ_MULTIPLIER,
                            type: opType.type,
                            path: JSON.stringify({originalOpType: opType.sourceType, offset: offset})
                        };
                    })
                );            
                offset++;
            }

            result[opType.type] = transactions;
        }

        //Unprocessed payments/conclusions are supplements by default
        this.processPayment([].concat(result.supplement, result.origination||[]));

        return [].concat(...Object.values(result));
    }

    async processPayment(transactions){
        let txData = transactions.reduce((data, tx) => {
            //TODO: Review
            if(data[tx.fromAlias] || tx.type === 'origination'){
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
}

module.exports = TEZ;