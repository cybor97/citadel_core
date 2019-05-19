const axios = require('axios');
const BaseConnector = require('./baseConnector');

const CONTRACT_HASH = '0x30f855afb78758Aa4C2dc706fb0fA3A98c865d2d';
const TOPIC_DELEGATE = '0x510b11bb3f3c799b11307c01ab7db0d335683ef5b2da98f7697de744f465eacc';
const PRECENDING_ZEROES = '0'.repeat(24);
const VALUE_FEE_MULTIPLIER = Math.pow(10, 18);

class TEZ extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://api.etherscan.io/api';
    }

    async getAllTransactions(address){
        //ETH has a bit longer addresses with precending 0-es
        if(address.length === 42){
            address = address.replace('0x', `0x${PRECENDING_ZEROES}`);
        }
        //FIXME: Consider re-implement with RPCs eth_getLogs&eth_getTransactionByHash
        return [].concat(
            await this.getAllTransactionsWithTopic(address, 'topic1'),
            await this.getAllTransactionsWithTopic(address, 'topic2')
        );
    }

    async getAllTransactionsWithTopic(address, topic){
        return (await axios.get(this.apiUrl, {
            params: {
                module: 'logs',
                action: 'getLogs',
                fromBlock: '0',
                toBlock: 'latest',
                address: CONTRACT_HASH,
                topic0: TOPIC_DELEGATE,
                [topic]: address
            }
        }))
            .data
            .result
            .map(tx => {
                return ({
                    //0 is methodId
                    from: tx.topics[1].replace(`0x${PRECENDING_ZEROES}`, '0x'),
                    to: tx.topics[2].replace(`0x${PRECENDING_ZEROES}`, '0x'),
                    hash: tx.transactionHash,
                    date: parseInt(tx.timeStamp) * 1000,
                    //always 0 for delegation
                    value: 0,
                    fromAlias: null,
                    fee: parseInt(tx.gasUsed) * parseInt(tx.gasPrice)/VALUE_FEE_MULTIPLIER,
                    type: 'delegation',
                    path: JSON.stringify({
                        blockNumber: parseInt(tx.blockNumber), 
                        transactionIndex: parseInt(tx.transactionIndex)
                    }),
                    originalOpType: 'transaction'
                })
            });
    }
}

module.exports = TEZ;