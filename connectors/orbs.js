const axios = require('axios');
const BaseConnector = require('./baseConnector');

const CONTRACT_HASH = '0x30f855afb78758Aa4C2dc706fb0fA3A98c865d2d';
const TOPIC_DELEGATE = '0x510b11bb3f3c799b11307c01ab7db0d335683ef5b2da98f7697de744f465eacc';

class TEZ extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://api.etherscan.io/api';
    }

    async getAllTransactions(address){
        return (await axios.get(this.apiUrl, {
            params: {
                module: 'logs',
                action: 'getLogs',
                fromBlock: '0',
                toBlock: 'latest',
                address: CONTRACT_HASH,
                topic0: TOPIC_DELEGATE,
                topic1: address
            }
        }))
            .data
            .result
            .map(tx => {


                return ({
                    //0 is methodId
                    from: tx.topics[1],
                    to: tx.topics[2],
                    hash: tx.transactionHash,
                    date: new Date(parseInt(tx.timeStamp) * 1000).getTime(),
                    //always 0 for delegation
                    value: 0,
                    fromAlias: null,
                    fee: parseInt(tx.gasUsed) * parseInt(tx.gasPrice)/1000000000/1000000000,
                    type: 'delegation'
                })
            });
    }
}

module.exports = TEZ;