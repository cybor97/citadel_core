const axios = require('axios');
const eztz = require('eztz.js');
const BaseConnector = require('./baseConnector');
const config = require('../../config');

const M_TEZ_MULTIPLIER = 1000000;
const QUERY_COUNT = 50;
const OP_TYPES = [
    { type: 'origination', sourceType: 'Origination' },
    { type: 'supplement', sourceType: 'Transaction' },
    { type: 'delegation', sourceType: 'Delegation' },
]

class TEZ extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = 'https://api6.tzscan.io/v3';
        this.bakingBadUrl = 'https://baking-bad.org/';
        this.rpcUrl = `http://${config.tezos.ip}:${config.tezos.port}`;

        eztz.eztz.node.setProvider(this.rpcUrl);
        this.eztzInstance = eztz.eztz;
    }

    validateAddress(address) {
        return !!address.match(/^(tz|KT)[a-zA-Z0-9]*$/);
    }

    async getServiceAddresses() {
        let bakingBadAppHtml = (await axios.get(this.bakingBadUrl, { responseType: 'text' })).data;
        let bakingBadAppJsPath = bakingBadAppHtml.match(/\/js\/app\.[a-z0-9]*\.js/)[0];

        let data = (await axios.get(`${this.bakingBadUrl}/${bakingBadAppJsPath}`)).data;
        let tzAddressMatches = data.match(/(tz|KT)([a-zA-Z0-9]{34}): *{ *name/g)
            .map(c => c.match(/(tz|KT)([a-zA-Z0-9]{34})/)[0]);
        let uniqueMatches = [];
        for (let address of tzAddressMatches) {
            if (uniqueMatches.indexOf(address) === -1) {
                uniqueMatches.push(address);
            }
        }
        return uniqueMatches;
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, lastPaths, serviceAddresses) {
        let result = {};

        for (let opType of OP_TYPES) {
            let transactionsCount = (await axios.get(`${this.apiUrl}/number_operations/${address}`, {
                params: {
                    type: opType.sourceType
                }
            })).data[0];
            let transactions = [];
            let offset = 0;
            for (let tx of lastPaths) {
                if (tx.originalOpType === opType.sourceType && tx.path &&
                    (opType.type === 'delegation' || opType === 'origination')) {
                    offset = JSON.parse(tx.path).offset;
                }
            }

            while (transactions.length < transactionsCount) {
                let newTransactions = (await axios.get(`${this.apiUrl}/operations/${address}`, {
                    params: {
                        type: opType.sourceType,
                        number: QUERY_COUNT,
                        p: offset
                    }
                })).data;

                newTransactions = newTransactions.map((tx, i, arr) => {
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
                        path: JSON.stringify({ queryCount: QUERY_COUNT, offset: offset })
                    };
                })
                transactions = transactions.concat(newTransactions);
                offset++;
            }

            result[opType.type] = transactions;
        }

        //Unprocessed payments/conclusions are supplements by default
        this.processPayment([].concat(result.supplement, result.origination || []), serviceAddresses);

        return [].concat(...Object.values(result));
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
        let isKT = address.startsWith('KT');
        return await this.eztzInstance.rpc.prepareOperation(address, {
            kind: 'transaction',
            source: address,
            fee: '1420',
            gas_limit: isKT ? '10600' : '10100',
            storage_limit: isKT ? '300' : '0',
        }, false);
    }

    async prepareTransfer(fromAddress, toAddress, amount) {
        let isKT = toAddress.startsWith('KT');
        return await this.eztzInstance.rpc.prepareOperation(fromAddress, {
            kind: 'transaction',
            fee: '1420',
            gas_limit: isKT ? '10600' : '10100',
            storage_limit: isKT ? '300' : '0',
            amount: (Number(amount) * M_TEZ_MULTIPLIER).toString(),
            destination: toAddress
        }, false);
    }

    async prepareDelegation(fromAddress, toAddress) {
        return await this.eztzInstance.rpc.prepareOperation(fromAddress, {
            kind: 'delegation',
            fee: '1420',
            gas_limit: '10100',
            storage_limit: '0',
            delegate: toAddress
        }, false).catch(err => err);
    }

    async prepareProposal(votingId, fromAddress, proposal) {
        let blockMetadata = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/metadata`)).data;

        return await this.eztzInstance.rpc.prepareOperation(fromAddress, {
            kind: 'proposals',
            source: fromAddress,
            period: blockMetadata.level.voting_period,
            proposals: [proposal]
        }, false).catch(err => err);
    }

    async prepareBallot(votingId, fromAddress, ballot) {
        let blockMetadata = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/metadata`)).data;
        let currentProposal = (await axios.get(`${this.rpcUrl}/chains/main/blocks/head/votes/current_proposal`)).data;

        return await this.eztzInstance.rpc.prepareOperation(fromAddress, {
            kind: 'ballot',
            source: fromAddress,
            period: blockMetadata.level.voting_period,
            proposal: currentProposal,
            ballot: ballot
        }, false).catch(err => err);
    }

    async prepareOrigination(fromAddress, balance) {
        return await this.eztzInstance.rpc.prepareOperation(fromAddress, {
            kind: 'origination',
            fee: '257',
            balance: (Number(balance) * M_TEZ_MULTIPLIER).toString(),
            gas_limit: 10100,
            storage_limit: 277,
            manager_pubkey: fromAddress,
            spendable: true,
            delegatable: true
        }, false).catch(err => err)
    }

    async sendTransaction(address, signedTransaction) {
        return await this.eztzInstance.rpc.silentInject(signedTransaction.sopbytes);
    }

    async getInfo() {
        let marketCapData = (await axios.get(`${this.apiUrl}/marketcap`)).data[0];

        let priceUsd = marketCapData.price_usd;
        let priceBtc = marketCapData.price_btc;
        return {
            priceUsd: priceUsd,
            priceBtc: priceBtc,
            priceUsdDelta24: priceUsd * marketCapData.percent_change_24h,
            priceBtcDelta24: priceBtc * marketCapData.percent_change_24h,
            yield: 0,
            marketCap: marketCapData.total_supply * priceUsd,
            circulatingSupply: marketCapData.total_supply,
            stakingRate: 0,
            unbondingPeriod: 0
        }
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

    async validateDelegationAddress(address){
        let valid = address.match(/^tz[a-zA-Z0-9]*/);
        return {valid: !!valid, message: valid ? 'OK' : 'Address should be TZ for tezos!'};
    }

    async getDelegationBalanceInfo(address) {
        let mainBalanceInfo = await this.getAddressBalanceInfo(address);
        let mainBalance = parseInt(mainBalanceInfo.balance / M_TEZ_MULTIPLIER);
        let addresses = [];
        let delegatedBalance = 0;
        let transactionsCount = (await axios.get(`${this.apiUrl}/number_operations/${address}`, {
            params: {
                type: 'Origination'
            }
        })).data[0];
        let offset = 0;

        while (addresses.length < transactionsCount) {
            let newTransactions = (await axios.get(`${this.apiUrl}/operations/${address}`, {
                params: {
                    type: 'Origination',
                    number: QUERY_COUNT,
                    p: offset
                }
            })).data;

            let newAddresses = newTransactions.map(tx => 
                tx.type.operations.find(op => op.kind === 'origination').tz1.tz
            );
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

    async getAddressBalanceInfo(address){
        return await axios.get(`${this.apiUrl}/node_account/${address}`, {
            headers: {
                'Referer': `https://tzscan.io/${address}?default=origination`
            },
            validateStatus: false
        }).then(resp => resp.status === 500 ? {balance: 0} : resp.data);
    }
}

module.exports = TEZ;