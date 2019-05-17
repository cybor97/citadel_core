const axios = require('axios');
const BaseConnector = require('./baseConnector');

const THRESHOLD = 1000 * 60 * 60 * 12;//6 hours in ms
const REWARDS_INTERVAL = 1000 * 60 * 60 * 24 * 3;//3 days in ms
const MIN_CONFIDENCE_COUNT = 3;//tx count with date diff <= THRESHOLD

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
        let transactions = (await axios.get(`${this.apiUrl}/operations/${address}?type=Transaction`)).data;
        transactions = transactions
            .map(tx => {
                let txData = tx.type.operations[0];
                return {
                    hash: tx.hash,
                    date: Date.parse(txData.timestamp),
                    value: txData.amount,
                    from: txData.src.tz,
                    to: txData.destination.tz,
                    fee: txData.fee,
                    type: 'supplement'
                };
            });
        
        let delegations = (await axios.get(`${this.apiUrl}/operations/${address}?type=Delegation`)).data;
        delegations = delegations
            .map(tx => {
                let txData = tx.type.operations[0];
                return {
                    hash: tx.hash,
                    date: Date.parse(txData.timestamp),
                    value: 0,
                    from: txData.src.tz,
                    to: txData.delegate.tz,
                    fee: txData.fee,
                    type: 'delegation'
                }
            });
        
        let txData = transactions.reduce((data, tx) => {
                if(data[tx.from] === undefined){
                    data[tx.from] = [];
                }
                data[tx.from].push(tx.date);
                return data;
            }, {});
        let rewardAddresses = Object.keys(txData)
            .filter(key => {
                let dates = txData[key];
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

        return [].concat(transactions, delegations);
    }
}

module.exports = TEZ;