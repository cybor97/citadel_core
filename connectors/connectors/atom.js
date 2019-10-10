const axios = require('axios');
const config = require('../../config');
const Bittrex = require('../bittrex');
const BaseConnector = require('./baseConnector');
const StakedYield = require('../stakedYields');

const ATOM_MULTIPLIER = Math.pow(10, 6);
const QUERY_COUNT = 100;

class ATOM extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = 'https://stargate.cosmos.network';
    }

    validateAddress(address) {
        return !!address.match(/^cosmos[a-z0-9]*$/);
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, lastPaths) {
        let offsets = {};
        for (let tx of lastPaths) {
            if (tx.type != 'supplement') {
                offsets[tx.originalOpType] = tx.path ? JSON.parse(tx.path).offset : 0;
            }
            else {
                offsets[tx.type] = tx.path ? JSON.parse(tx.path).offset : 0;
            }
        }

        return [].concat(
            await this.getSupplement(address, offsets.send_sender, offsets.offset_recipient),
            await this.getDelegations(address, offsets.delegation || 0),
            await this.getRewards(address, offsets.supplement || 0)
        );
    }

    async getSupplement(address, offsetSender, offsetRecipient) {
        //action=send&(sender=address|recipient=address)
        return [].concat(
            await this.processSupplement(await this.getRawForAction(address, 'send', 'sender', offsetSender), 'sender'),
            await this.processSupplement(await this.getRawForAction(address, 'send', 'recipient', offsetRecipient), 'recipient')
        );
    }

    async processSupplement(rawData, role) {
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
                    path: JSON.stringify({ queryCount: QUERY_COUNT, offset: ~~(i / QUERY_COUNT) + 1 })
                });
            });
    }

    async getDelegations(address, offset) {
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
                    path: JSON.stringify({ queryCount: QUERY_COUNT, offset: ~~(i / QUERY_COUNT) + 1 }),
                    isCancelled: tx.logs && tx.logs.length > 0 && tx.logs[0].success != null && !tx.logs[0].success
                });
            });
    }

    async getRewards(address, offset) {
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
                    value: self.calculateAmount(tx.tx.value.fee.amount) + self.calculateRewardAmount(tx.tags),
                    fee: 0,
                    //from is not applicable here
                    from: self.findSourceValidator(tx.tags),
                    to: msg.value.delegator_address,
                    originalOpType: 'withdraw_delegator_reward',
                    type: 'payment',
                    path: JSON.stringify({ queryCount: QUERY_COUNT, offset: ~~(i / QUERY_COUNT) + 1 })
                });
            });

    }

    findSourceValidator(tags) {
        let validatorTag = tags.find(tag => tag.key === 'source-validator');
        return validatorTag && validatorTag.value || null;
    }

    calculateRewardAmount(tags) {
        return tags && tags.reduce((prev, next) => {
            return prev + (next.key === 'rewards' && next.value && next.value.includes('uatom') ? Number(next.value.trim('uatom')[0] || 0) : 0);
        }, 0) / ATOM_MULTIPLIER || 0
    }

    calculateAmount(amount) {
        return amount
            ? amount.reduce((prev, next) =>
                prev + (next.denom === 'uatom') ? next.amount : 0
                , 0) / ATOM_MULTIPLIER
            : 0;
    }

    async getRawForAction(address, action, actionRole, offset) {
        let result = [];
        let lastHash = null;
        let page = offset || 1;
        while (result.length % QUERY_COUNT == 0) {
            let current = (await axios.get(`${this.apiUrl}/txs`, {
                params: {
                    action: action,
                    [actionRole]: address,
                    page: page,
                    limit: QUERY_COUNT
                }
            })).data;

            if (current.length === 0 || (lastHash !== null && current[current.length - 1].txhash === lastHash)) {
                break;
            }
            if (result.length > config.maxTransactionsTracked) {
                throw new Error("TX_LIMIT_OVERFLOW");
            }
            result = result.concat(current);
            page++;
        }
        return result;
    }

    async getInfo() {
        return Object.assign(await Bittrex.getInfo('ATOM', 'btc-atom'), await StakedYield.getInfo('ATOM'), {
            yield: 9.85,
            unbondingPeriod: '21 days'
        });
    }

    async getVoting() {
        let data = (await axios.get(`${this.apiUrl}/gov/proposals`)).data;

        return data.map(voting => ({
            originalId: voting.proposal_id,
            title: voting.proposal_content.value.title,
            net: 'atom',
            start_datetime: Date.parse(voting.voting_start_time),
            end_datetime: Date.parse(voting.voting_end_time),
            answers: Object.keys(voting.final_tally_result).map(key => ({
                id: key,
                title: key.split('_').map(c => c[0].toUpperCase() + c.substr(1, c.length)).join(' '),
                vote_count: voting.final_tally_result[key]
            }))
        }));
    }
}

module.exports = ATOM;