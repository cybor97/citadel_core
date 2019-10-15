const http = require('http');
const https = require('https');
const axios = require('axios');
const IOST = require('iost');

const BaseConnector = require('./baseConnector');
const config = require('../../config');
const log = require('../../utils/log');
const { ValidationError } = require('../../utils/errors');

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
        this.axiosClient = axios.create({
            timeout: 10000,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true })
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
                    path: JSON.stringify({ queryCount: QUERY_COUNT, offset: offset }),
                    isCancelled: (tx.status_code != 'SUCCESS')
                }))
            );

            if (offset > config.maxTransactionsTracked) {
                throw new Error("TX_LIMIT_OVERFLOW");
            }

        }

        return result;

    }

    async getNextBlock(lastPathsNet, serviceAddresses) {
        let path = lastPathsNet && lastPathsNet.path;
        if (typeof (path) === 'string') {
            path = JSON.parse(path);
        }
        let opTypes = OP_TYPES.reduce((prev, next) => {
            prev[next.sourceType] = next.type;
            return prev;
        }, {});

        let blockNumber = path && path.blockNumber != null ? path.blockNumber : 0;
        log.info(`fromBlock ${blockNumber}`);
        let transactions = null;

        while (!transactions || !transactions.length) {
            log.info(`blockNumber ${blockNumber}`);

            let block = await this.axiosClient.get(`http://${config.iostCoin.ip}:${config.iostCoin.port}/getBlockByNumber/${blockNumber}/true`);
            transactions = block.data.block.transactions
                .map(tx => (tx.actions || [])
                    .map(txAction => {
                        //0 - token, 1 - from, 2 - to, 3 - amount, 4 - message(optional)
                        txAction.data = JSON.parse(txAction.data);
                        return txAction;
                    })
                    .filter(txAction => txAction.data[0] === 'iost')
                    .map(txAction => ({
                        hash: tx.hash,
                        //iost stores timestamp in ns
                        date: parseInt(tx.time) / 1000000,
                        value: txAction.data[3],
                        comment: txAction.data[4] || '',
                        from: txAction.data[1],
                        fromAlias: txAction.data[1],
                        to: txAction.data[2],
                        //iost hasn't fee in token(even for base.iost)
                        fee: 0,
                        originalOpType: `${txAction.contract}/${txAction.action_name}`,
                        type: opTypes[`${txAction.contract}/${txAction.action_name}`],
                        path: JSON.stringify({ blockNumber: block.data.block.number }),
                        isCancelled: (tx.tx_receipt.status_code != 'SUCCESS')
                    })))
                .reduce((prev, next) => prev.concat(next), []);
            blockNumber++;
        }

        return transactions;
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
            yield: 5.5,
            marketCap: marketCapData.market_cap,
            circulatingSupply: marketCapData.circulating_supply,
            stakingRate: 0,
            unbondingPeriod: '7 days'
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

    async getVoting() {
        let total = (await axios.get(`${this.apiUrl}/producers`, {
            params: {
                size: 1
            }
        })).data.total;
        let data = (await axios.get(`${this.apiUrl}/producers`, {
            params: {
                size: total
            }
        })).data.producers;

        return {
            originalId: 0,
            title: 'Vote for validator',
            net: 'iost',
            start_datetime: 1072915200000,
            end_datetime: null,
            answers: data.map(producer => ({
                id: producer.account,
                title: producer.alias_en || producer.alias || producer.account,
                vote_count: parseInt(producer.votes)
            }))
        }
    }

    async prepareTransfer(fromAddress, toAddress, amount) {
        return this.iost.transfer('iost', fromAddress, toAddress, amount, 'transfer via citadel_core');
    }

    async sendTransaction(address, signedTransaction) {
        try {
            let accountInfo = await axios.get(`http://${config.iostCoin.ip}:${config.iostCoin.port}/getAccount/${address}/true`);
            accountInfo = accountInfo.data;
            const sendResult = await this.rpc.transaction.sendTx(signedTransaction);

            return sendResult && sendResult.hash;
        }
        catch (err) {
            if (err && err.response && err.response.data) {
                err = err.response.data;
            }

            if (err && err && err.message) {
                if (err.message.match(/id invalid/)) {
                    throw new ValidationError('Invalid address');
                }
                throw new Error(err.message);
            }
            throw err;
        }
    }
}

module.exports = IOSTCoin;