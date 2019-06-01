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
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, lastPaths){
        let result = {};
        for(let opType of OP_TYPES){
            let transactionsCount = null;
            let transactions = [];
            let offset = 0;
            for(let tx of lastPaths){
                if(parseInt(tx.originalOpType) === opType.sourceType && tx.path){
                    offset = JSON.parse(tx.path).offset;
                    break;
                }
            }

            while(transactionsCount === null || transactions.length < transactionsCount){
                console.log(`^${offset} - ${transactions.length}/${transactionsCount}`);
                let transactionsListResponse = (await axios.post(this.apiUrl, {
                    'id': RPC_ID,
                    'jsonrpc': RPC_VERSION,
                    'method': 'getAccountTxs',
                    'params': [offset, QUERY_COUNT, address, opType.sourceType, true]
                })).data.result;
                if(transactionsListResponse){
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
                            : tx.tos[0].value;
    
                        transactions.push({
                            hash: tx.hash,
                            date: tx.createTime,
                            value: txValue / M_NULS_MULTIPLIER,
                            from: txFrom,
                            to: txTo,
                            fee: tx.fee / M_NULS_MULTIPLIER,
                            originalOpType: opType.sourceType,
                            type: opType.type,
                            path: JSON.stringify({queryCount: QUERY_COUNT, offset: offset})
                        });  
                    }
    
                    offset++;    
                }
                else{
                    transactionsCount = 0;
                }
            }

            result[opType.type] = transactions;
        }

        return [].concat(...Object.values(result));
    }

}

module.exports = NULS;