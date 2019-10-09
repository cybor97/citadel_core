const axios = require('axios');
const eztz = require('eztz.js');
const BaseConnector = require('./baseConnector');
const config = require('../../config');
const StakedYields = require('../stakedYields');
const { ValidationError, TransactionError } = require('../../utils/errors');

const log = require('../../utils/log');

const M_TEZ_MULTIPLIER = 1000000;
const QUERY_COUNT = 50;
const OP_TYPES = [
    { type: 'origination', sourceType: 'Origination' },
    { type: 'supplement', sourceType: 'Transaction' },
    { type: 'delegation', sourceType: 'Delegation' },
];

class TEZ extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = `http://${config.tezos.apiIp || config.tezos.ip}:${config.tezos.apiPort || 8080}/v1`;
        this.rpcUrl = `http://${config.tezos.ip}:${config.tezos.port}`;
        this.bakingBadUrl = 'https://test.baking-bad.org/v1/bakers';

        eztz.eztz.node.setProvider(this.rpcUrl);
        this.eztzInstance = eztz.eztz;
    }

    validateAddress(address) {
        return !!address.match(/^(tz|KT)[a-zA-Z0-9]*$/);
    }

    async getServiceAddresses() {
        let bakersData = (await axios.get(this.bakingBadUrl, {
            params: {
                configs: false,
                rating: false,
                insurance: false
            }
        })).data;
        return bakersData.map(c => c.address);
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, lastPaths, serviceAddresses) {
        let result = {};

        for (let opType of OP_TYPES) {
            let total = (await axios.get(`${this.apiUrl}/number_operations/${address}`, {
                params: {
                    type: opType.sourceType
                }
            })).data[0];

            let transactions = [];
            let newTransactions = null;
            let offset = 0;
            for (let tx of lastPaths) {
                if (tx.originalOpType === opType.sourceType && tx.path) {
                    offset = JSON.parse(tx.path).offset;
                }
            }
            if (total > config.maxTransactionsTracked || offset > config.maxTransactionsTracked) {
                throw new Error("TX_LIMIT_OVERFLOW");
            }

            while (newTransactions == null || newTransactions.length == QUERY_COUNT) {
                if (total > config.maxTransactionsTracked || offset > config.maxTransactionsTracked) {
                    throw new Error("TX_LIMIT_OVERFLOW");
                }

                const page = ~~(offset / QUERY_COUNT);
                newTransactions = (await axios.get(`${this.apiUrl}/operations/${address}`, {
                    params: {
                        type: opType.sourceType,
                        number: QUERY_COUNT,
                        p: page
                    }
                })).data;
                log.info('Downloading', address, `query_count:${QUERY_COUNT}|offset:${offset}|length:${newTransactions.length}|total:${total}`);

                transactions = transactions.concat(newTransactions.map((tx, i, arr) => {
                    let txData = tx.type.operations[0];
                    let toField = txData.destination || txData.delegate || txData.tz1;
                    let to = toField ? toField.tz : null;
                    return {
                        hash: tx.hash,
                        date: Date.parse(txData.timestamp),
                        value: ((txData.amount || txData.balance) / M_TEZ_MULTIPLIER) || 0,
                        from: txData.src.tz,
                        fromAlias: txData.src.alias,
                        to: to,
                        fee: txData.fee / M_TEZ_MULTIPLIER,
                        originalOpType: opType.sourceType,
                        type: opType.type,
                        path: JSON.stringify({ queryCount: QUERY_COUNT, offset: (++offset) }),
                        isCancelled: txData.failed
                    };
                }));
            }
            result[opType.type] = transactions;
        }

        //Unprocessed payments/conclusions are supplements by default
        this.processPayment([].concat(result.supplement, result.origination || []), serviceAddresses);
        let resultTransactions = [].concat(...Object.values(result));

        return resultTransactions;
    }

    async isRevealed(address) {
        return (await axios.get(`${this.apiUrl}/operations/${address}`, { params: { type: 'Reveal' } })).data.length > 0;
    }

    async processPayment(transactions, serviceAddresses) {
        transactions.forEach(tx => {
            if (tx.fromAlias || serviceAddresses.indexOf(tx.from) !== -1) {
                tx.type = 'payment';
            }
            else if (tx.type == 'origination') {
                tx.type = 'supplement';
            }
        });
    }

    async prepareReveal(address) {
        return await this.prepareOperation(address, {
            kind: 'transaction',
            source: address,
            fee: '1420',
            gas_limit: '10600',
            storage_limit: '300',
            amount: '1420',
            destination: address
        }, false);
    }

    async prepareTransfer(fromAddress, toAddress, amount) {
        return await this.prepareOperation(fromAddress, {
            kind: 'transaction',
            fee: '1420',
            gas_limit: '10600',
            storage_limit: '300',
            amount: (Number(amount) * M_TEZ_MULTIPLIER).toString(),
            destination: toAddress
        }, false);
    }

    async prepareDelegation(fromAddress, toAddress) {
        return await this.prepareOperation(fromAddress, {
            kind: 'delegation',
            fee: '1420',
            gas_limit: '10100',
            storage_limit: '0',
            delegate: toAddress
        }, false);
    }

    async prepareProposal(votingId, fromAddress, proposal) {
        let blockMetadata = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/metadata`)).data;

        return await this.prepareOperation(fromAddress, {
            kind: 'proposals',
            source: fromAddress,
            period: blockMetadata.level.voting_period,
            proposals: [proposal]
        }, false);
    }

    async prepareBallot(votingId, fromAddress, ballot) {
        let blockMetadata = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/metadata`)).data;
        let currentProposal = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/votes/current_proposal`)).data;

        return await this.prepareOperation(fromAddress, {
            kind: 'ballot',
            source: fromAddress,
            period: blockMetadata.level.voting_period,
            proposal: currentProposal,
            ballot: ballot
        }, false);
    }

    async prepareOrigination(fromAddress, balance) {
        return await this.prepareOperation(fromAddress, {
            kind: 'origination',
            fee: '1420',
            balance: (Number(balance) * M_TEZ_MULTIPLIER).toString(),
            gas_limit: 10100,
            storage_limit: 300,
            manager_pubkey: fromAddress,
            spendable: true,
            delegatable: true
        }, false);
    }

    async prepareOperation(...params) {
        try {
            return await this.eztzInstance.rpc.prepareOperation(...params);
        }
        catch (err) {
            if (typeof (err) === 'string') {
                if (err.match(/(Cannot parse contract id)|(Invalid contract notation)|(Unexpected data \(Signature.Public_key_hash\))/)) {
                    throw new ValidationError('Invalid address');
                }
                else if (err.match(/unexpected string value .* instead of "nay" , "yay" or "pass"/)) {
                    throw new ValidationError('Invalid voting value, should be nay, yay or pass');
                }
                throw new Error(err);
            }
            throw err;
        }
    }

    async sendTransaction(address, signedTransaction) {
        if (typeof (signedTransaction) !== 'string' && !signedTransaction.sopbytes) {
            throw new ValidationError('signedTransaction should be string or object contains sopbytes');
        }

        try {
            return await this.eztzInstance.rpc.silentInject(typeof (signedTransaction) === 'string'
                ? signedTransaction
                : signedTransaction.sopbytes);
        }
        catch (err) {
            let errMessage = err && ((typeof (err) === 'string' && err) || err.message || (err.length && err[0] && err[0].msg) || err.name);
            log.err('Send transaction error', err);
            if (errMessage) {
                if (errMessage.match(/(Empty implicit contract)/)) {
                    throw new TransactionError('Insufficient balance');
                }
                else if (errMessage.match(/(Counter.* already used for contract)/)) {
                    throw new TransactionError('Address already have pending transaction on node')
                }
                else if (errMessage.match(/(The operation signature is invalid)/)) {
                    throw new TransactionError('Invalid signature')
                }
            }
            throw err;
        }

    }

    async getInfo() {
        let marketCapData = (await axios.get(`${this.apiUrl}/marketcap`)).data[0];
        let priceUsd = marketCapData.price_usd;
        let priceBtc = marketCapData.price_btc;
        return Object.assign({
            priceUsd: priceUsd,
            priceBtc: priceBtc,
            priceUsdDelta24: priceUsd * marketCapData.percent_change_24h,
            priceBtcDelta24: priceBtc * marketCapData.percent_change_24h,
            yield: 0,
            marketCap: marketCapData.total_supply * priceUsd,
            circulatingSupply: marketCapData.total_supply,
            stakingRate: 0,
            unbondingPeriod: 0
        }, await StakedYields.getInfo('XTZ'), {
            yield: 6.59,
            unbondingPeriod: 'instant'
        });
    }

    async getVoting() {
        let blockMetadata = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/metadata`)).data;
        let blockHeader = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/header`)).data;
        let startBlockHeader = (await axios.get(
            `${this.rpcUrl}/chains/main/blocks/head-${blockMetadata.level.voting_period_position}/header`
        )).data;
        let currentVotingBallots = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/votes/ballots`)).data;
        let currentQuorum = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/votes/current_quorum`)).data;
        let blockTimestamp = Date.parse(blockHeader.timestamp);
        let startTimestamp = Date.parse(startBlockHeader.timestamp);
        let endTimestamp = Math.floor(startTimestamp + ((blockTimestamp - startTimestamp) / blockMetadata.level.voting_period_position) * 4 * currentQuorum);

        return {
            originalId: blockMetadata.next_protocol,
            title: `Accept protocol amendment ${blockMetadata.next_protocol}`,
            net: 'tez',
            start_datetime: startTimestamp,
            end_datetime: endTimestamp,
            answers: Object.keys(currentVotingBallots).map((key, i) => ({ id: i, title: key, vote_count: currentVotingBallots[key] }))
        }
    }

    async validateDelegationAddress(address) {
        let valid = address.match(/^tz[a-zA-Z0-9]*/);
        return { valid: !!valid, message: valid ? 'OK' : 'Address should be TZ for tezos!' };
    }

    async getDelegationBalanceInfo(address) {
        let mainBalanceInfo = await this.getAddressBalanceInfo(address);
        let mainBalance = mainBalanceInfo.balance / M_TEZ_MULTIPLIER;

        let addresses = [];
        let delegatedBalance = 0;
        let offset = 0;
        let newTransactions = null;

        while (newTransactions == null || newTransactions.length == QUERY_COUNT) {
            newTransactions = (await axios.get(`${this.apiUrl}/operations/${address}`, {
                params: {
                    type: 'Origination',
                    number: QUERY_COUNT,
                    p: ~~(offset / QUERY_COUNT)
                }
            })).data;

            let newAddresses = newTransactions.map(tx => {
                offset++;
                return tx.type.operations.find(op => op.kind === 'origination').tz1.tz
            });
            addresses = addresses.concat(newAddresses);

            delegatedBalance += (await Promise.all(newAddresses.map(async newAddress =>
                parseInt((await this.getAddressBalanceInfo(newAddress)).balance) / M_TEZ_MULTIPLIER
            ))).reduce((prev, next) => prev + next, 0);

            offset++;
        }

        return {
            mainBalance: mainBalance,
            delegatedBalance: delegatedBalance,
            originatedAddresses: addresses
        }
    }

    async getAddressBalanceInfo(address) {
        return await axios.get(`${this.apiUrl}/node_account/${address}`, {
            headers: {
                'Referer': `https://tzscan.io/${address}?default=origination`
            },
            validateStatus: false
        }).then(resp => resp.status === 500 ? { balance: 0 } : resp.data);
    }
}

module.exports = TEZ;