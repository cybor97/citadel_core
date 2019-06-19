const axios = require('axios');
const Bittrex = require('../bittrex');
const BaseConnector = require('./baseConnector');

const ATOM_MULTIPLIER = Math.pow(10, 6);
const QUERY_COUNT = 100;

class ATOM extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://stargate.cosmos.network/txs';
    }

    validateAddress(address){
        return !!address.match(/^cosmos[a-z0-9]*$/);
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, lastPaths){
        let offsets = {};
        for(let tx of lastPaths){
            if(tx.type != 'supplement'){
                offsets[tx.originalOpType] = tx.path ? JSON.parse(tx.path).offset : 0;
            }
            else{
                offsets[tx.type] = tx.path ? JSON.parse(tx.path).offset : 0;
            }
        }

        return [].concat(
            await this.getSupplement(address, offsets.send_sender, offsets.offset_recipient),
            await this.getDelegations(address, offsets.delegation || 0),
            await this.getRewards(address, offsets.supplement || 0)
        );
    }

    async getSupplement(address, offsetSender, offsetRecipient){
        //action=send&(sender=address|recipient=address)
        return [].concat(
            await this.processSupplement(await this.getRawForAction(address, 'send', 'sender', offsetSender), 'sender'),
            await this.processSupplement(await this.getRawForAction(address, 'send', 'recipient', offsetRecipient), 'recipient')
        );
    }

    async processSupplement(rawData, role){
        let self = this;
        return rawData
            .filter(tx => tx.tx && tx.tx.value.msg && tx.tx.value.msg.length)
            .map((tx, i) => {
                let msg = tx.tx.value.msg[0];
                return ({
                    hash: tx.txhash,
                    date: new Date(tx.timestamp).getTime(),
                    value: self.calculateAmount(msg.value.amount),
                    fee: self.calculateAmount(tx.tx.value.fee.amount),
                    from: msg.value.from_address,
                    to: msg.value.to_address,
                    originalOpType: `send_${role}`,
                    type: 'supplement',
                    path: JSON.stringify({queryCount: QUERY_COUNT, offset: ~~(i / QUERY_COUNT) + 1})
                });
        });
    }

    async getDelegations(address, offset){
        //action=delegate&delegator=address
        let self = this;
        let rawData = await this.getRawForAction(address, 'delegate', 'delegator', offset);
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
                    path: JSON.stringify({queryCount: QUERY_COUNT, offset: ~~(i / QUERY_COUNT) + 1})
                });
            });
    }

    async getRewards(address, offset){
        //action=withdraw_delegator_reward&delegator=address
        let self = this;
        let rawData = await this.getRawForAction(address, 'withdraw_delegator_reward', 'delegator', offset);
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
                    path: JSON.stringify({queryCount: QUERY_COUNT, offset: ~~(i / QUERY_COUNT) + 1})
                });
            });

    }

    calculateAmount(amount){
        return amount 
            ? amount.reduce((prev, next) => 
                prev + (next.denom === 'uatom') ? next.amount : 0
            , 0) / ATOM_MULTIPLIER
            : 0;
    }

    async getRawForAction(address, action, actionRole, offset){
        let result = [];
        let lastHash = null;
        let page = offset || 1;
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

    async getInfo(){
        return await Bittrex.getInfo('ATOM', 'btc-atom');
    }
}

module.exports = ATOM;