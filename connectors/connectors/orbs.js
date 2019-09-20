const axios = require('axios');
const Web3 = require('web3');
const EventEmitter = require('events');
const ETHToken = require('./ethToken');
const Bittrex = require('../bittrex');
const config = require('../../config')

const DELEGATE_CONTRACT_HASH = '0x30f855afb78758Aa4C2dc706fb0fA3A98c865d2d';
const DELEGATE_TOPIC = '0x510b11bb3f3c799b11307c01ab7db0d335683ef5b2da98f7697de744f465eacc';

const TRANSFER_CONTRACT_HASH = '0xff56Cc6b1E6dEd347aA0B7676C85AB0B3D08B0FA';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const VOTING_CONTRACT_HASH = '0x30f855afb78758Aa4C2dc706fb0fA3A98c865d2d';
const VOTING_TOPIC = '0x94a3724087eae106b6eeb3198e1c6a4c9a6ece40950796a3d1350e110aad4b21';

const PRECENDING_ZEROES = '0'.repeat(24);

class ORBS extends ETHToken {
    constructor() {
        super();
        this.subscriptions = new Map();
        this.apiUrlVotingProxy = 'https://orbs-voting-proxy-server.herokuapp.com/api';
    }

    subscribe(address) {
        if (address.length === 42) {
            address = address.replace('0x', `0x${PRECENDING_ZEROES}`);
        }
        if (!this.subscriptions.has(address)) {
            let emitter = new EventEmitter();
            let netSubscriptions = [
                super.subscribeForContractMethod(DELEGATE_CONTRACT_HASH, DELEGATE_TOPIC, 'delegation', address, 'topic1'),
                super.subscribeForContractMethod(DELEGATE_CONTRACT_HASH, DELEGATE_TOPIC, 'delegation', address, 'topic2'),
                super.subscribeForContractMethod(TRANSFER_CONTRACT_HASH, TRANSFER_TOPIC, 'supplement', address, 'topic1'),
                super.subscribeForContractMethod(TRANSFER_CONTRACT_HASH, TRANSFER_TOPIC, 'supplement', address, 'topic2')
            ];
            let subscriptionData = {
                emitter: emitter,
                netSubscriptions: netSubscriptions,

                emitTimeout: null,
                lastUpdate: Date.now(),
                buffer: []
            };
            netSubscriptions.forEach(subscription => subscription.on('data', data => {
                subscriptionData.buffer.push(data);
                if (subscriptionData.emitTimeout) {
                    clearTimeout(subscriptionData.emitTimeout);
                }
                subscriptionData.emitTimeout = setTimeout(() => {
                    emitter.emit('data', subscriptionData.buffer);
                    subscriptionData.buffer = [];
                    subscriptionData.lastUpdate = Date.now();
                    subscriptionData.emitTimeout = null;
                }, config.updateInterval);
            }));

            this.subscriptions.set(address, subscriptionData);
            return emitter;
        }
        console.log('shouldNotResubscribe')

        return this.subscriptions.get(address).emitter;
    }

    //TODO: Trigger on address delete
    unsubscribe(address) {
        if (this.subscriptions.has(address)) {
            this.subscriptions.get(address).netSubscriptions.forEach(c => c.unsubscribe());
            this.subscriptions.delete(address);
        }
    }

    async getAllTransactions(address, lastPaths = []) {
        //ETH has a bit longer addresses with precending 0-es
        if (address.length === 42) {
            address = address.replace('0x', `0x${PRECENDING_ZEROES}`);
        }

        let supplementFromBlock = null, delegateFromBlock = null, rewardLastUpdate = null;
        for (let tx of lastPaths) {
            if (tx.type === 'supplement' && tx.path) {
                supplementFromBlock = JSON.parse(tx.path).blockNumber;
            }
            if (tx.type === 'delegation' && tx.path) {
                delegateFromBlock = JSON.parse(tx.path).blockNumber;
            }
            if (tx.type === 'payment' && tx.path) {
                rewardLastUpdate = JSON.parse(tx.path).updatedAt;
            }
        }

        return [].concat(
            await this.getDelegateTransactions(address, 'topic1', delegateFromBlock),
            await this.getDelegateTransactions(address, 'topic2', delegateFromBlock),

            await this.getTransferTransactions(address, 'topic1', supplementFromBlock),
            await this.getTransferTransactions(address, 'topic2', supplementFromBlock),

            await this.getRewardTransactions(address, rewardLastUpdate)
        );
    }

    async getRewardTransactions(address, rewardLastUpdate = null) {
        let addressClean = address.replace(`0x${PRECENDING_ZEROES}`, '0x');
        let data = null;

        //TODO: Review, should be taken from config.
        if (rewardLastUpdate !== null && (Date.now() - rewardLastUpdate) < 259200000/*3d*/) {
            return [];
        }

        try {
            data = (await axios.get(
                `${this.apiUrlVotingProxy}/rewards/${addressClean}`
            )).data;
        }
        catch (err) {
            console.error(err);
            return [];
        }

        return [{
            from: null,
            to: addressClean,
            hash: 1,
            date: Date.now(),
            value: data.delegatorReward,
            fee: 0,
            type: 'payment',
            path: JSON.stringify({ updatedAt: Date.now() }),
            originalOpType: 'delegatorReward',

            forceUpdate: true
        }, {
            from: null,
            to: addressClean,
            hash: 2,
            date: Date.now(),
            value: data.guardianReward,
            fee: 0,
            type: 'payment',
            path: JSON.stringify({ updatedAt: Date.now() }),
            originalOpType: 'guardianReward',

            forceUpdate: true
        }, {
            from: null,
            to: addressClean,
            hash: 3,
            date: Date.now(),
            value: data.validatorReward,
            fee: 0,
            type: 'payment',
            path: JSON.stringify({ updatedAt: Date.now() }),
            originalOpType: 'validatorReward',

            forceUpdate: true
        }
        ];
    }

    async getDelegateTransactions(address, topic, fromBlock = 0) {
        return await this.getTransactionsForContractMethod(DELEGATE_CONTRACT_HASH, DELEGATE_TOPIC,
            'delegation', address, topic, fromBlock);
    }

    async getTransferTransactions(address, topic, fromBlock = 0) {
        return await this.getTransactionsForContractMethod(TRANSFER_CONTRACT_HASH, TRANSFER_TOPIC,
            'supplement', address, topic, fromBlock);
    }

    getTransferABI() {
        return [{ "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [{ "name": "token", "type": "address" }], "name": "reclaimToken", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "_from", "type": "address" }, { "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [{ "name": "contractAddr", "type": "address" }], "name": "reclaimContract", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_subtractedValue", "type": "uint256" }], "name": "decreaseApproval", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [], "name": "owner", "outputs": [{ "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [], "name": "TOTAL_SUPPLY", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [{ "name": "from_", "type": "address" }, { "name": "value_", "type": "uint256" }, { "name": "data_", "type": "bytes" }], "name": "tokenFallback", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_addedValue", "type": "uint256" }], "name": "increaseApproval", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "newOwner", "type": "address" }], "name": "transferOwnership", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "name": "_distributor", "type": "address" }], "payable": false, "stateMutability": "nonpayable", "type": "constructor" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "owner", "type": "address" }, { "indexed": true, "name": "spender", "type": "address" }, { "indexed": false, "name": "value", "type": "uint256" }], "name": "Approval", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "from", "type": "address" }, { "indexed": true, "name": "to", "type": "address" }, { "indexed": false, "name": "value", "type": "uint256" }], "name": "Transfer", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "previousOwner", "type": "address" }, { "indexed": true, "name": "newOwner", "type": "address" }], "name": "OwnershipTransferred", "type": "event" }];
    }

    getTransferContractAddress() {
        return TRANSFER_CONTRACT_HASH;
    }

    getDelegateABI() {
        return [{ "constant": true, "inputs": [{ "name": "delegator", "type": "address" }], "name": "getCurrentDelegation", "outputs": [{ "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "to", "type": "address" }], "name": "delegate", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [], "name": "undelegate", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [{ "name": "guardian", "type": "address" }], "name": "getCurrentVote", "outputs": [{ "name": "validators", "type": "address[]" }, { "name": "blockNumber", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [], "name": "maxVoteOutCount", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [{ "name": "guardian", "type": "address" }], "name": "getCurrentVoteBytes20", "outputs": [{ "name": "validatorsBytes20", "type": "bytes20[]" }, { "name": "blockNumber", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "validators", "type": "address[]" }], "name": "voteOut", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [], "name": "VERSION", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "inputs": [{ "name": "maxVoteOutCount_", "type": "uint256" }], "payable": false, "stateMutability": "nonpayable", "type": "constructor" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "voter", "type": "address" }, { "indexed": false, "name": "validators", "type": "address[]" }, { "indexed": false, "name": "voteCounter", "type": "uint256" }], "name": "VoteOut", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "delegator", "type": "address" }, { "indexed": true, "name": "to", "type": "address" }, { "indexed": false, "name": "delegationCounter", "type": "uint256" }], "name": "Delegate", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "delegator", "type": "address" }, { "indexed": false, "name": "delegationCounter", "type": "uint256" }], "name": "Undelegate", "type": "event" }];
    }

    getDelegationContractAddress() {
        return DELEGATE_CONTRACT_HASH;
    }

    getVotingABI() {
        return [{ "constant": true, "inputs": [{ "name": "delegator", "type": "address" }], "name": "getCurrentDelegation", "outputs": [{ "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "to", "type": "address" }], "name": "delegate", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [], "name": "undelegate", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [{ "name": "guardian", "type": "address" }], "name": "getCurrentVote", "outputs": [{ "name": "validators", "type": "address[]" }, { "name": "blockNumber", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [], "name": "maxVoteOutCount", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [{ "name": "guardian", "type": "address" }], "name": "getCurrentVoteBytes20", "outputs": [{ "name": "validatorsBytes20", "type": "bytes20[]" }, { "name": "blockNumber", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "name": "validators", "type": "address[]" }], "name": "voteOut", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [], "name": "VERSION", "outputs": [{ "name": "", "type": "uint256" }], "payable": false, "stateMutability": "view", "type": "function" }, { "inputs": [{ "name": "maxVoteOutCount_", "type": "uint256" }], "payable": false, "stateMutability": "nonpayable", "type": "constructor" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "voter", "type": "address" }, { "indexed": false, "name": "validators", "type": "address[]" }, { "indexed": false, "name": "voteCounter", "type": "uint256" }], "name": "VoteOut", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "delegator", "type": "address" }, { "indexed": true, "name": "to", "type": "address" }, { "indexed": false, "name": "delegationCounter", "type": "uint256" }], "name": "Delegate", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "delegator", "type": "address" }, { "indexed": false, "name": "delegationCounter", "type": "uint256" }], "name": "Undelegate", "type": "event" }];
    }

    async getInfo() {
        return await Bittrex.getInfo('ORBS', 'btc-orbs');
    }

    async getVoting() {
        let validators = (await axios.get(`${this.apiUrlVotingProxy}/validators`)).data;

        return {
            originalId: 0,
            title: 'Vote for new validator',
            net: 'orbs',
            start_datetime: 0,
            end_datetime: null,
            answers: await Promise.all(validators.map(async (address) => {
                let validatorData = (await axios.get(`${this.apiUrlVotingProxy}/validators/${address}`)).data;

                return {
                    id: address,
                    title: validatorData.name,
                    vote_count: null
                }
            }))
        }
    }

    async prepareBallot(votingId, fromAddress, ballot) {
        let web3 = new Web3(`${config.parity.protocol || 'http'}://${config.parity.ip}:${config.parity.port}`);
        let contractAddress = VOTING_CONTRACT_HASH;
        let contract = new web3.eth.Contract(this.getVotingABI(), contractAddress);
        let transferData = contract.methods.voteOut([ballot]);
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
}

module.exports = ORBS;
