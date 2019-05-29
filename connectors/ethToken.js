const axios = require('axios');
const BaseConnector = require('./baseConnector');

const VALUE_FEE_MULTIPLIER = Math.pow(10, 18);
const PRECENDING_ZEROES = '0'.repeat(24);

class ETHToken extends BaseConnector {
    //FIXME: Consider re-implement with RPCs eth_getLogs&eth_getTransactionByHash
    async getTransactionsForContractMethod(contractHash, methodTopic, type, address, topic, fromBlock = null){
        console.log(type, fromBlock)
        return (await axios.get(this.apiUrl, {
            params: {
                module: 'logs',
                action: 'getLogs',
                fromBlock: fromBlock || 0,
                toBlock: 'latest',
                address: contractHash,
                topic0: methodTopic,
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
                    value: type === 'delegation' ? 0 : tx.data / VALUE_FEE_MULTIPLIER,
                    fromAlias: null,
                    fee: parseInt(tx.gasUsed) * parseInt(tx.gasPrice) / VALUE_FEE_MULTIPLIER,
                    type: type,
                    path: JSON.stringify({
                        blockNumber: parseInt(tx.blockNumber), 
                        transactionIndex: parseInt(tx.transactionIndex)
                    }),
                    originalOpType: 'transaction'
                })
            });
    }    
}

module.exports = ETHToken;