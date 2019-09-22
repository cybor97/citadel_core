const axios = require('axios');
const config = require('../../config');
const CoinMarketCap = require('../coinmarketcap');
const BaseConnector = require('./baseConnector');

const log = require('../../utils/log');

const M_NULS_MULTIPLIER = Math.pow(10, 8);

const RPC_ID = 945;
const RPC_VERSION = '2.0';
const CHAIN_ID = 1;

const QUERY_COUNT = 100;

const OP_TYPES = [
    { type: 'supplement', sourceType: 2 },
    { type: 'payment', sourceType: 1 },
]

const VOTING_CONTRACT_ADDRESS = 'NseQih5xZa6vAWsL6uY5drozyW4tqzQx';

class NULS extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = 'https://public1.nuls.io';
    }

    validateAddress(address) {
        return !!address.match(/^N[a-zA-Z0-9]*$/);
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, lastPaths) {
        let result = {};
        for (let opType of OP_TYPES) {
            let transactions = [];
            let newTransactionsCount = null;
            let offset = 0;
            for (let tx of lastPaths) {
                if (parseInt(tx.originalOpType) === opType.sourceType && tx.path) {
                    offset = JSON.parse(tx.path).offset;
                    break;
                }
            }
            while (newTransactionsCount === null || newTransactionsCount > 0) {
                let transactionsListResponse = (await axios.post(this.apiUrl, {
                    'id': RPC_ID,
                    'jsonrpc': RPC_VERSION,
                    'method': 'getAccountTxs',
                    //chainId, page, count, address, type, blockFrom, blockTo(-1 = latest)
                    //offset starts with 1, citadel defines 0
                    'params': [CHAIN_ID, offset + 1, QUERY_COUNT, address, opType.sourceType, 0, -1]
                })).data.result;

                if (transactionsListResponse) {
                    let transactionsCount = transactionsListResponse.totalCount;
                    if (transactionsCount > config.maxTransactionsTracked) {
                        throw new Error("TX_LIMIT_OVERFLOW");
                    }


                    let transactionsList = transactionsListResponse.list;
                    newTransactionsCount = transactionsList.length || 0;
                    for (let txItem of transactionsList) {
                        let tx = (await axios.post(this.apiUrl, {
                            'id': RPC_ID,
                            'jsonrpc': RPC_VERSION,
                            'method': 'getTx',
                            'params': [CHAIN_ID, txItem.txHash]
                        })).data.result;

                        if (!tx.coinFroms && !tx.coinTos) {
                            log.warn(`NULS empty transaction: ${tx.hash}!`);
                            continue;
                        }

                        let txFrom = tx.type === 2 && tx.coinFroms && tx.coinFroms.length ? tx.coinTos[0].address : null;
                        //Find 'to', that is not equal to from(is not a change)
                        let txTo = tx.type === 1 ? address : tx.coinTos.find(txToItem => txToItem.address != txFrom) || tx.coinTos[0] || null;
                        if (txTo && txTo.address) {
                            txTo = txTo.address;
                        }


                        //TODO: Check balance calculation
                        let txValue = tx.type === 1
                            ? tx.coinTos.reduce((prev, next) => next.address === address ? prev + next.amount : prev, 0)
                            //If 2, other unsupported
                            : tx.coinTos[0].amount;

                        transactions.push({
                            hash: tx.hash,
                            date: tx.createTime * 1000,
                            value: txValue / M_NULS_MULTIPLIER,
                            from: txFrom,
                            to: txTo,
                            fee: tx.fee.value / M_NULS_MULTIPLIER,
                            originalOpType: opType.sourceType,
                            type: opType.type,
                            path: JSON.stringify({ queryCount: QUERY_COUNT, offset: offset })
                        });
                    }

                    offset++;
                }
                else {
                    log.err(`NULS empty response for ${address}`);
                    newTransactionsCount = 0;
                }
            }

            result[opType.type] = transactions;
        }

        return [].concat(...Object.values(result));
    }

    async getInfo() {
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

    async getVoting() {
        return [{
            originalId: 1,
            title: 'Test voting(mock)',
            net: 'nuls',
            start_datetime: 0,
            end_datetime: Date.now() + 86400000,
            answers: [{ "id": 0, "title": "yay", "vote_count": 31374 }, { "id": 1, "title": "nay", "vote_count": 0 }, { "id": 2, "title": "pass", "vote_count": 20674 }]
        }];
    }

    processVotingItem(votingItem) {
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