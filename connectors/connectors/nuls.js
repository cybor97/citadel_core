const axios = require('axios');
const CoinMarketCap = require('../coinmarketcap');
const BaseConnector = require('./baseConnector');

const M_NULS_MULTIPLIER = Math.pow(10, 8);

const RPC_ID = 5898;
const RPC_VERSION = '2.0';

const QUERY_COUNT = 100;

const OP_TYPES = [
    {type: 'supplement', sourceType: 2},
    {type: 'payment', sourceType: 1},
]

const VOTING_CONTRACT_ADDRESS = 'NseQih5xZa6vAWsL6uY5drozyW4tqzQx';

class NULS extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://api.nuls.io';
    }

    validateAddress(address){
        return !!address.match(/^N[a-zA-Z0-9]*$/);
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

    async getInfo(){
        return await CoinMarketCap.getInfo('NULS');
    }

    // async getVoting(){
    //     let votingId = 1;
    //     let result = [];
    //     while(true){
    //         let data = (await axios.post('https://nuls.world/addresses/contracts/call', {
    //             contractAddress: VOTING_CONTRACT_ADDRESS,
    //             methodName: 'queryVote',
    //             args: [votingId.toString()]
    //         })).data;

    //         if(data == null){
    //             break;
    //         }

    //         try{
    //             let votingDataStrFixed = data.result
    //                 .replace(/\n|\r|\t/g, ' ')
    //                 .replace(/\}\{/g, '},{');
    
    //             let votingData = JSON.parse(votingDataStrFixed);
    //             result.push(this.processVotingItem(votingData));
    //         }
    //         catch(exc){
    //             if(!(exc instanceof SyntaxError)){
    //                 throw exc;
    //             }
    //         }
    //         votingId++;
    //     }
    //     return result;
    // }

    async getVoting(){
        return [{
            originalId: 1,
            title: 'Test voting(mock)',
            net: 'nuls',
            start_datetime: 0,
            end_datetime: Date.now() + 86400000,
            answers: [{"id":0,"title":"yay","vote_count":31374},{"id":1,"title":"nay","vote_count":0},{"id":2,"title":"pass","vote_count":20674}]
        }];
    }

    processVotingItem(votingItem){
        return ({
            originalId: votingItem.id,
            title: votingItem.title,
            net: 'nuls',
            start_datetime: votingItem.config && votingItem.config.startTime,
            end_datetime: votingItem.config && votingItem.config.endTime,
            answers: votingItem.items.map(c => ({
                id: c.id,
                title: c.content,
                vote_count: null
            }))
        });
    }
}

module.exports = NULS;