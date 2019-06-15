const axios = require('axios');
const Web3 = require('web3');

const BaseConnector = require('./baseConnector');
const config =  require('../config')

const VALUE_FEE_MULTIPLIER = Math.pow(10, 18);
const PRECENDING_ZEROES = '0'.repeat(24);
  
class ETHToken extends BaseConnector {
    validateAddress(address){
        return !!address.match(/^0x[a-zA-Z0-9]*$/);
    }

    //FIXME: Consider re-implement with RPCs eth_getLogs&eth_getTransactionByHash
    async getTransactionsForContractMethod(contractHash, methodTopic, type, address, topic, fromBlock = null){
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

    async prepareTransfer(fromAddress, toAddress, amount){
        let web3 = new Web3(`http://${config.parity.ip}:${config.parity.port}`);
        let contractAddress = this.getTransferContractAddress();
        let contract = new web3.eth.Contract(this.getTransferABI(), contractAddress);
        let transferData = contract.methods.transfer(toAddress, web3.utils.toHex(amount * VALUE_FEE_MULTIPLIER));
        let transactionCount = await web3.eth.getTransactionCount(fromAddress, 'latest');
        let gasPrice = await web3.eth.getGasPrice();
        let chainId = await web3.eth.getChainId();

        const abi = transferData.encodeABI();

        let transfer = {
            to: contractAddress, 
            data: abi, 
            gas: 200000,/**Recommended for tokens */
            nonce: transactionCount,
            gasPrice: gasPrice,
            chainId: chainId
        };
        return transfer;
    }

    async prepareDelegation(fromAddress, toAddress){
        let web3 = new Web3(`http://${config.parity.ip}:${config.parity.port}`);
        let contractAddress = this.getDelegationContractAddress();
        let contract = new web3.eth.Contract(this.getDelegateABI(), contractAddress);
        let delegateData = contract.methods.delegate(toAddress).encodeABI();
        let transactionCount = await web3.eth.getTransactionCount(fromAddress, 'latest');
        let gasPrice = await web3.eth.getGasPrice();
        let chainId = await web3.eth.getChainId();

        let delegation = {
            to: contractAddress, 
            data: delegateData, 
            gas: 200000,
            nonce: transactionCount,
            gasPrice: gasPrice,
            chainId: chainId            
        };
        return delegation;
    }

    async sendTransaction(address, signedTransaction){
        let web3 = new Web3(`http://${config.parity.ip}:8545`);
        //TODO: Add address validation
        return new Promise((resolve, reject)=>{
            web3.eth.sendSignedTransaction(signedTransaction)
                .on('transactionHash', resolve)
                .on('error', reject);
        });
    }
}

module.exports = ETHToken;