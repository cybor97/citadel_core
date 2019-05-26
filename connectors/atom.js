const axios = require('axios');
const BaseConnector = require('./baseConnector');

const ATOM_MULTIPLIER = Math.pow(10, 6);
const QUERY_COUNT = 100;

class ATOM extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://stargate.cosmos.network/txs';
    }

    /**
     * Get start with
     * @param {String} address 
     * @param {Array} lastPaths Last paths as {OriginalType:offset}
     */
    async getStartWith(address, lastPaths = null){
        //TODO: Implement
        //For this token should start with 1!
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address){
        return [].concat(
            await this.getSupplement(address),
            await this.getDelegations(address),
            await this.getRewards(address)
        );
    }

    async getSupplement(address){
        //action=send&(sender=address|recipient=address)
        return [].concat(
            await this.processSupplement(await this.getRawForAction(address, 'send', 'sender')),
            await this.processSupplement(await this.getRawForAction(address, 'send', 'recipient'))
        );
    }

    async processSupplement(rawData){
        let self = this;
        return rawData
            .filter(tx => tx.tx.value.msg && tx.tx.value.msg.length)
            .map((tx, i) => {
                let msg = tx.tx.value.msg[0];
                return ({
                    hash: tx.txhash,
                    date: new Date(tx.timestamp).getTime(),
                    value: self.calculateAmount(msg.value.amount),
                    fee: self.calculateAmount(tx.tx.value.fee.amount),
                    from: msg.value.from_address,
                    to: msg.value.to_address,
                    originalOpType: 'send',
                    type: 'supplement',
                    path: JSON.stringify({queryCount: QUERY_COUNT, offset: (i / QUERY_COUNT) + 1})
                });
        });
    }

    async getDelegations(address){
        //action=delegate&delegator=address
        let self = this;
        let rawData = await this.getRawForAction(address, 'delegate', 'delegator');
        return rawData
            .filter(tx => tx.tx.value.msg && tx.tx.value.msg.length)
            .map((tx, i) => {
                let msg = tx.tx.value.msg[0];
                return ({
                    hash: tx.txhash,
                    date: new Date(tx.timestamp).getTime(),
                    //API returns object for delegations
                    value: self.calculateAmount([msg.value.amount]),
                    fee: self.calculateAmount(tx.tx.value.fee.amount),
                    //delegator_address is not that we need
                    from: null,
                    to: msg.value.validator_address,
                    originalOpType: 'delegate',
                    type: 'delegation',
                    path: JSON.stringify({queryCount: QUERY_COUNT, offset: (i / QUERY_COUNT) + 1})
                });
            });
    }

    async getRewards(address){
        //action=withdraw_delegator_reward&delegator=address
        let self = this;
        let rawData = await this.getRawForAction(address, 'withdraw_delegator_reward', 'delegator');
        return rawData
            .filter(tx => tx.tx.value.msg && tx.tx.value.msg.length)
            .map((tx, i) => {
                let msg = tx.tx.value.msg[0];
                return ({
                    hash: tx.txhash,
                    date: new Date(tx.timestamp).getTime(),
                    //reward value is reward fee(sum of fees of processed txs in blockchain)
                    value: self.calculateAmount(tx.tx.value.fee.amount),
                    fee: null,
                    //from is not applicable here
                    from: null,
                    to: msg.value.delegator_address,
                    originalOpType: 'withdraw_delegator_reward',
                    type: 'payment',
                    path: JSON.stringify({queryCount: QUERY_COUNT, offset: (i / QUERY_COUNT) + 1})
                });
            });

    }

    calculateAmount(amount){
        return amount.reduce((prev, next) => 
            prev + (next.denom === 'uatom') ? next.amount : 0
        , 0) / ATOM_MULTIPLIER;
    }

    async getRawForAction(address, action, actionRole){
        let result = [];
        let lastHash = null;
        let page = 1;
        while(result.length % QUERY_COUNT == 0){
            let current = (await axios.get(this.apiUrl, {
                params: {
                    action: action,
                    [actionRole]: address,
                    page: page,
                    limit: QUERY_COUNT
                }
            })).data;

            if(current.length === 0 || (lastHash !== null && current[current.length - 1].txhash === lastHash)){
                break;
            }
            result = result.concat(current);
            page++;
        }
        return result;
    }
}

module.exports = ATOM;