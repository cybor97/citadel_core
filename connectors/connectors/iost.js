const axios = require('axios');
const ETHToken = require('./ethToken');
const Bittrex = require('../bittrex');

const TRANSFER_CONTRACT_HASH = '0xFA1a856Cfa3409CFa145Fa4e20Eb270dF3EB21ab';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const PRECENDING_ZEROES = '0'.repeat(24);

class IOST extends ETHToken {
    constructor() {
        super();
        this.apiUrl = 'https://api.etherscan.io/api';
    }

    async getAllTransactions(address, lastPaths) {
        return [];
        //ETH has a bit longer addresses with precending 0-es
        if (address.length === 42) {
            address = address.replace('0x', `0x${PRECENDING_ZEROES}`);
        }

        let supplementFromBlock = null;
        for (let tx of lastPaths) {
            if (tx.type === 'supplement' && tx.path) {
                supplementFromBlock = JSON.parse(tx.path).blockNumber;
                break;
            }
        }

        return [].concat(
            await this.getTransferTransactions(address, 'topic1', supplementFromBlock),
            await this.getTransferTransactions(address, 'topic2', supplementFromBlock),
        );
    }

    async getTransferTransactions(address, topic, fromBlock = 0) {
        return await this.getTransactionsForContractMethod(TRANSFER_CONTRACT_HASH, TRANSFER_TOPIC,
            'supplement', address, topic, fromBlock);
    }

    getTransferABI() {
        return [{ "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "_from", "type": "address" }, { "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "inputs": [], "payable": false, "stateMutability": "nonpayable", "type": "constructor" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_from", "type": "address" }, { "indexed": true, "name": "_to", "type": "address" }, { "indexed": false, "name": "_value", "type": "uint256" }], "name": "Transfer", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }, { "indexed": true, "name": "_spender", "type": "address" }, { "indexed": false, "name": "_value", "type": "uint256" }], "name": "Approval", "type": "event" }];
    }

    getTransferContractAddress() {
        return TRANSFER_CONTRACT_HASH;
    }

    async getInfo() {
        return await Bittrex.getInfo('IOST', 'btc-iost');
    }

    async getVoting() {
        return {
            originalId: 0,
            title: 'Vote for mainnet node',
            net: 'iost',
            start_datetime: 1072915200000,
            end_datetime: null,
            answers: []
        }
    }

}

module.exports = IOST;