const axios = require('axios');
const ETHToken = require('./ethToken');

const DELEGATE_CONTRACT_HASH = '0x30f855afb78758Aa4C2dc706fb0fA3A98c865d2d';
const DELEGATE_TOPIC = '0x510b11bb3f3c799b11307c01ab7db0d335683ef5b2da98f7697de744f465eacc';

const TRANSFER_CONTRACT_HASH = '0xff56Cc6b1E6dEd347aA0B7676C85AB0B3D08B0FA';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const PRECENDING_ZEROES = '0'.repeat(24);

class ORBS extends ETHToken {
    constructor(){
        super();
        this.apiUrl = 'https://api.etherscan.io/api';
        this.apiUrlVotingProxy = 'https://orbs-voting-proxy-server.herokuapp.com/api';
    }

    async getAllTransactions(address){
        //ETH has a bit longer addresses with precending 0-es
        if(address.length === 42){
            address = address.replace('0x', `0x${PRECENDING_ZEROES}`);
        }
        //FIXME: Consider re-implement with RPCs eth_getLogs&eth_getTransactionByHash
        return [].concat(
            await this.getDelegateTransactions(address, 'topic1'),
            await this.getDelegateTransactions(address, 'topic2'),

            await this.getTransferTransactions(address, 'topic1'),
            await this.getTransferTransactions(address, 'topic2'),

            await this.getRewardTransactions(address)
        );
    }

    async getRewardTransactions(address){
        let addressClean = address.replace(`0x${PRECENDING_ZEROES}`, '0x');
        let data = (await axios.get(
            `${this.apiUrlVotingProxy}/rewards/${addressClean}`
        )).data;

        return [{
                from: null,
                to: addressClean,
                hash: 1,
                date: Date.now(),
                value: data.delegatorReward,
                fee: 0,
                type: 'payment',
                path: null,
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
                path: null,
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
                path: null,
                originalOpType: 'validatorReward',

                forceUpdate: true
            }
        ];
    }

    async getDelegateTransactions(address, topic){
        return await this.getTransactionsForContractMethod(DELEGATE_CONTRACT_HASH, DELEGATE_TOPIC, 'delegation', address, topic);
    }

    async getTransferTransactions(address, topic){
        return await this.getTransactionsForContractMethod(TRANSFER_CONTRACT_HASH, TRANSFER_TOPIC, 'supplement', address, topic);
    }
}

module.exports = ORBS;