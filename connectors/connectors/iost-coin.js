const axios = require('axios');
const BaseConnector = require('./baseConnector');
const config = require('../../config');

const QUERY_COUNT = 50;
const OP_TYPES = [
    { type: 'supplement', sourceType: 'token.iost/transfer' },
    { type: 'delegation', sourceType: 'vote.iost/transfer' },
]

class IOSTCoin extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = 'https://www.iostabc.com/api';
        this.apiUrlAdditional = `https://api.iostabc.com/api/?apikey=${config.iostCoin.apikey}`;
    }

    validateAddress(address) {
        return address.match(/[a-zA-Z0-9_-]/);
    }

    async getAllTransactions(address, lastPaths) {
        let maxOffset = 0;
        for (let tx of lastPaths) {
            if (tx.path) {
                let lastPathData = JSON.parse(tx.path);
                let offset = lastPathData.offset;
                if (lastPathData && offset > maxOffset) {
                    maxOffset = offset;
                }
            }
        }
        let opTypes = OP_TYPES.reduce((prev, next) => {
            prev[next.sourceType] = next.type;
            return prev;
        }, {});

        let offset = maxOffset;
        let newTransactionsData = null;
        let result = [];
        while (newTransactionsData == null || newTransactionsData.length == QUERY_COUNT) {
            let resp = await axios.get(`${this.apiUrlAdditional}`, {
                params: {
                    module: 'account',
                    action: 'get-account-tx',
                    account: address,
                    size: QUERY_COUNT,
                    page: ~~(offset / QUERY_COUNT)
                }
            });
            newTransactionsData = resp.data.data.transactions;

            result = result.concat(newTransactionsData
                .map(tx => {
                    //0 - token, 1 - from, 2 - to, 3 - amount, 4 - message(optional)
                    tx.data = JSON.parse(tx.data);
                    return tx;
                })
                .filter(tx => tx.data[0] === 'iost')
                .map((tx, i) => ({
                    hash: tx.tx_hash,
                    date: new Date(tx.created_at).getTime(),
                    value: tx.data[3],
                    comment: tx.data[4],
                    from: tx.from,
                    fromAlias: tx.from,
                    to: tx.to,
                    fee: 0,
                    originalOpType: `${tx.contract}/${tx.action_name}`,
                    type: opTypes[`${tx.contract}/${tx.action_name}`],
                    path: JSON.stringify({ queryCount: QUERY_COUNT, offset: (++offset) })
                }))
            );
        }

        return result;

    }

    async getInfo() {
        let marketCapData = (await axios.get(`${this.apiUrl}/marketcap`)).data[0];

        let priceUsd = marketCapData.price_usd;
        let priceBtc = marketCapData.price_btc;

        //priceUsd | priceBtc | priceUsdDelta24 | priceBtcDelta24 | yield | marketCap | circulatingSupply
        //    V    |    E     |        V        |        E        |   E   |      V    |           V 

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

    async getDelegationBalanceInfo(address) {
        let delegatedData = await axios.get(`${this.apiUrl}/voters/${address}`);
        delegatedData = delegatedData.data;
        let delegation = delegatedData.voters.find(c => c.account === address);
        let delegatedTotal = parseInt(delegation.votes);

        let createdAccounts = await axios.get(`${this.apiUrl}/account/${address}/created`);
        createdAccounts = createdAccounts.data.accounts;

        let availableBalanceData = await axios.get(`${this.apiUrlAdditional}&module=account&action=get-account-balance&account=${address}`);
        availableBalanceData = availableBalanceData.data.data;

        return {
            mainBalance: parseFloat(availableBalanceData.balance),
            delegatedBalance: delegatedTotal,
            originatedAddresses: createdAccounts
        }
    }
}

module.exports = IOSTCoin;