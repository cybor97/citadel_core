const axios = require('axios');
const Web3 = require('web3');
const EventEmitter = require('events');

const BaseConnector = require('./baseConnector');
const config = require('../../config')

const log = require('../../utils/log');

const { ValidationError } = require('../../utils/errors');

const VALUE_FEE_MULTIPLIER = Math.pow(10, 18);
const PRECENDING_ZEROES = '0'.repeat(24);

class ETHToken extends BaseConnector {
    validateAddress(address) {
        return !!address.match(/^0x[a-zA-Z0-9]*$/);
    }

    async getTransactionsForContractMethod(contractHash, methodTopic, type, address, topic) {
        return await this.getTransactionsForContractMethodAdvanced({
            contractHash: contractHash,
            methodTopic: methodTopic,
            type: type,
            address: address,
            topic: topic
        });
    }

    async getTransactionsForContractMethodAdvanced(props) {
        let { contractHash, methodTopic, type, address, topic, fromBlock, toBlock, currency, web3 } = props;
        if (!web3) {
            web3 = new Web3(this.getParityUrl());
        }
        const resp = await web3.eth.getPastLogs({
            fromBlock: fromBlock || 'earliest',
            toBlock: toBlock || 'latest',
            address: contractHash,
            topics: [methodTopic, topic === 'topic1' ? address : null, topic === 'topic2' ? address : null]
        });

        let result = await Promise.all(resp
            .map(async tx => {
                let blockData = await web3.eth.getBlock(tx.blockHash);

                return ({
                    //0 is methodId
                    from: tx.topics[1].replace(`0x${PRECENDING_ZEROES}`, '0x'),
                    to: tx.topics[2].replace(`0x${PRECENDING_ZEROES}`, '0x'),
                    hash: tx.transactionHash,
                    date: parseInt(blockData.timestamp) * 1000,
                    //always 0 for delegation
                    value: type === 'delegation' ? 0 : tx.data / VALUE_FEE_MULTIPLIER,
                    fromAlias: null,
                    //fee is payed in ETH, token fee is always 0
                    fee: 0,//parseInt(txData.gas) * parseInt(txData.gasPrice) / VALUE_FEE_MULTIPLIER,
                    type: type,
                    currency: currency,
                    path: JSON.stringify({
                        blockNumber: parseInt(tx.blockNumber),
                        transactionIndex: parseInt(tx.transactionIndex)
                    }),
                    originalOpType: 'transaction'
                })
            }));

        return result;
    }

    /**
     * Subscribe for events
     * 
     * @param {String} contractHash 
     * @param {String} methodTopic 
     * @param {Number} type 
     * @param {String} address 
     * @param {String} topic 
     * @param {String} fromBlock 
     * @returns {EventEmitter}
     */
    subscribeForContractMethod(contractHash, methodTopic, type, address, topic, fromBlock) {
        let web3 = new Web3(new Web3.providers.WebsocketProvider(`${config.parity.wsProtocol || 'ws'}://${config.parity.ip}:${config.parity.port}/ws${config.parity.path || ''}`));
        let emitter = new EventEmitter();
        web3.eth.subscribe('logs', {
            fromBlock: fromBlock || 'earliest',
            toBlock: 'latest',
            address: contractHash,
            topics: [methodTopic, topic === 'topic1' ? address : null, topic === 'topic2' ? address : null]
        })
            .on('data', async (tx) => {
                const web3Internal = new Web3(this.getParityUrl());

                let txData = null;
                let blockData = null;
                //FIXME: Remove, sometimes web3 returrns null
                while (blockData === null) {
                    blockData = await web3Internal.eth.getBlock(tx.blockHash);
                }
                while (txData === null) {
                    txData = await web3Internal.eth.getTransaction(tx.transactionHash);
                }

                emitter.emit('data', ({
                    //0 is methodId
                    from: tx.topics[1].replace(`0x${PRECENDING_ZEROES}`, '0x'),
                    to: tx.topics[2].replace(`0x${PRECENDING_ZEROES}`, '0x'),
                    hash: tx.transactionHash,
                    date: parseInt(blockData.timestamp) * 1000,
                    //always 0 for delegation
                    value: type === 'delegation' ? 0 : tx.data / VALUE_FEE_MULTIPLIER,
                    fromAlias: null,
                    fee: parseInt(txData.gas) * parseInt(txData.gasPrice) / VALUE_FEE_MULTIPLIER,
                    type: type,
                    path: JSON.stringify({
                        blockNumber: parseInt(tx.blockNumber),
                        transactionIndex: parseInt(tx.transactionIndex)
                    }),
                    originalOpType: 'transaction'
                }));
            })
            .on('changed', (...params) => { log.debug('changed_data', params); })
            .on('error', (...params) => { log.err('error', params); });
        return emitter;
    }

    async prepareTransfer(fromAddress, toAddress, amount) {
        return await this.wrapPrepareOperation(async () => {
            let web3 = new Web3(this.getParityUrl());
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
        });
    }

    async prepareDelegation(fromAddress, toAddress) {
        if (!this.getDelegationContractAddress) {
            throw new ValidationError(`Specified net doesn't support delegation or not yet implemented.`);
        }

        return await this.wrapPrepareOperation(async () => {
            let web3 = new Web3(this.getParityUrl());
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
        });
    }

    async wrapPrepareOperation(prepareOperation) {
        try {
            return await prepareOperation();
        }
        catch (err) {
            log.err(typeof (err), err.message);
            if (err && err.message) {
                if (err.message.match(/(Provided address .* is invalid)|(invalid address)/)) {
                    throw new ValidationError('Invalid address');
                }
            }
            throw err;
        }
    }

    async sendTransaction(address, signedTransaction) {
        let web3 = new Web3(this.getParityUrl());

        try {
            let result = await new Promise((resolve, reject) => {
                web3.eth.sendSignedTransaction(signedTransaction)
                    .on('transactionHash', resolve)
                    .on('error', reject);
            });
            return { hash: result && result.message ? result.message : result };
        }
        catch (err) {
            if (err && err.message) {
                if (err.message.match(/insufficient funds/)) {
                    throw new ValidationError('Insufficient funds for gas * price + value or invalid signature.')
                }
            }

            throw err;
        }
    }

    getParityUrl() {
        return `${
            config.parity.protocol || 'http'}://${
            config.parity.ip}:${
            config.parity.port}${
            config.parity.path || ''}`;
    }
}

module.exports = ETHToken;