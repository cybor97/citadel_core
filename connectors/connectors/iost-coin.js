const axios = require('axios');
const BaseConnector = require('./baseConnector');
const config = require('../../config');
const IOST = require('iost');
const log = require('../../utils/log');

const QUERY_COUNT = 50;
const OP_TYPES = [
    { type: 'supplement', sourceType: 'token.iost/transfer' },
    { type: 'delegation', sourceType: 'vote.iost/transfer' },
]

class IOSTCoin extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = 'https://www.iostabc.com/api';
        this.apiUrlAdditional = `https://api.iostabc.com/api`;
        this.apiUrlBinance = 'https://www.binance.com/api';
        this.rpc = new IOST.RPC(new IOST.HTTPProvider(`http://${config.iostCoin.ip}:${config.iostCoin.port}`));
        this.iost = new IOST.IOST({
            gasRatio: 1,
            gasLimit: 100000,
            delay: 0
        });
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
                    apikey: config.iostCoin.apikey,
                    module: 'account',
                    action: 'get-account-tx',
                    account: address,
                    size: QUERY_COUNT,
                    page: ~~(offset / QUERY_COUNT)
                }
            });
            newTransactionsData = resp.data.data.transactions;
            log.info('Downloading', address, `query_count:${QUERY_COUNT}|offset:${offset}|length:${newTransactionsData.length}`);

            result = result.concat(newTransactionsData
                .map(tx => {
                    //0 - token, 1 - from, 2 - to, 3 - amount, 4 - message(optional)
                    tx.data = JSON.parse(tx.data);
                    //offset should include non-matching
                    offset++;
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
                    path: JSON.stringify({ queryCount: QUERY_COUNT, offset: offset })
                }))
            );

            if (offset > config.maxTransactionsTracked) {
                throw new Error("TX_LIMIT_OVERFLOW");
            }

        }

        return result;

    }

    async getInfo() {
        let marketCapData = await axios.get(`${this.apiUrl}/general/market`);
        let binanceData = await axios.get(`${this.apiUrlBinance}/v1/aggTrades?limit=80&symbol=IOSTBTC`);
        marketCapData = marketCapData.data;
        binanceData = binanceData.data;

        let priceUsd = marketCapData.usd_price;
        return {
            priceUsd: priceUsd,
            priceBtc: binanceData[binanceData.length - 1]['p'],
            priceUsdDelta24: priceUsd * (marketCapData.percent_change_24h / 100),
            priceBtcDelta24: (binanceData[0]['p'] - binanceData[binanceData.length - 1]['p']).toFixed(10),
            yield: 0,
            marketCap: marketCapData.market_cap,
            circulatingSupply: marketCapData.circulating_supply,
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

        let availableBalanceData = await axios.get(this.apiUrlAdditional, {
            params: {
                apikey: config.iostCoin.apikey,
                module: 'account',
                action: 'get-account-balance',
                account: address
            }
        });
        availableBalanceData = availableBalanceData.data.data;

        return {
            mainBalance: parseFloat(availableBalanceData.balance),
            delegatedBalance: delegatedTotal,
            originatedAddresses: createdAccounts
        }
    }

    async prepareTransfer(fromAddress, toAddress, amount) {
        return this.iost.transfer('iost', fromAddress, toAddress, amount, 'transfer via citadel_core');
    }

    async sendTransaction(address, signedTransaction) {
        let accountInfo = await axios.get(`http://${config.iostCoin.ip}:${config.iostCoin.port}/getAccount/${address}/true`);
        accountInfo = accountInfo.data;
        const sendResult = await this.rpc.transaction.sendTx(signedTransaction);

        return sendResult && sendResult.hash;
    }
}

module.exports = IOSTCoin;