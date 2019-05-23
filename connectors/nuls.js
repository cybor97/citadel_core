const axios = require('axios');
const BaseConnector = require('./baseConnector');

const M_NULS_MULTIPLIER = Math.pow(10, 8);

const RPC_ID = 5898;
const RPC_VERSION = '2.0';

const QUERY_COUNT = 100;

const OP_TYPES = [
    {type: 'supplement', sourceType: 2},
    {type: 'payment', sourceType: 1},
]

class NULS extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://api.nuls.io';
    }

    /**
     * Get start with
     * @param {String} address 
     * @param {Array} lastPaths Last paths as {OriginalType:offset}
     */
    async getStartWith(address, lastPaths = null){
        //TODO: Implement
        //For this token should start with 1!
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, startWith = {supplement: 1, payment: 1}){
        let result = {};
        for(let opType of OP_TYPES){
            let transactionsCount = null;
            let transactions = [];
            let offset = startWith[opType.type];
            while(transactionsCount === null || transactions.length < transactionsCount){
                let transactionsListResponse = (await axios.post(this.apiUrl, {
                    'id': RPC_ID,
                    'jsonrpc': RPC_VERSION,
                    'method': 'getAccountTxs',
                    'params': [offset, QUERY_COUNT, address, opType.sourceType, true]
                })).data.result;
                transactionsCount = transactionsListResponse.totalCount;
                let transactionsList = transactionsListResponse.list;

                for(let txItem of transactionsList){
                    let tx = (await axios.post(this.apiUrl, {
                        'id': RPC_ID,
                        'jsonrpc': RPC_VERSION,
                        'method': 'getTx',
                        'params': [txItem.txHash]
                    })).data.result;

                    if(!tx.froms && !tx.tos){
                        console.log(`NULS empty transaction: ${tx.hash}!`);
                        continue;
                    }

                    let txFrom = tx.type === 2 && tx.froms && tx.froms.length ? tx.froms[0].address : null;
                    //Find 'to', that is not equal to from(is not a change)
                    let txTo = tx.type === 1 ? address : tx.tos.find(txToItem => txToItem.address != txFrom);
                    txTo = txTo ? txTo.address : null;
                    //TODO: Check balance calculation
                    let txValue = tx.type === 1
                        ? tx.tos.reduce((prev,  next) => next.address === address ? prev + next.value : prev, 0)
                        //If 2, other unsupported
                        : tx.froms && tx.froms.length && tx.froms[0].address === address 
                            ? tx.froms[0].value
                            : tx.tos.reduce((prev,  next) => next.address === txFrom ? prev - next.value : prev + next.value, 0);

                    transactions.push({
                        hash: tx.hash,
                        date: tx.createTime,
                        value: txValue / M_NULS_MULTIPLIER,
                        from: txFrom,
                        to: txTo,
                        fee: tx.fee / M_NULS_MULTIPLIER,
                        originalOpType: opType.sourceType,
                        type: opType.type,
                        path: JSON.stringify({originalOpType: opType.sourceType, offset: offset})
                    });  
                }

                offset++;
            }

            result[opType.type] = transactions;
        }

        return [].concat(...Object.values(result));
    }

}

module.exports = NULS;