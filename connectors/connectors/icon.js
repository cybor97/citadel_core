const axios = require('axios');
const BaseConnector = require('./baseConnector');
const IconService = require('icon-sdk-js');
const config = require('../../config');
const log = require('../../utils/log');
const { ValidationError } = require('../../utils/errors');

const QUERY_COUNT = 50;
//1 - mainnet, 2 - exchanges testnet, 3 - D-Apps testnet
const NETWORK_ID = 1;
const ICON_VERSION = 3;

class ICON extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = 'https://tracker.icon.foundation/v3';
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

        let offset = maxOffset;
        let newTransactionsData = null;
        let result = [];
        while (newTransactionsData == null || newTransactionsData.length == QUERY_COUNT) {
            let resp = await axios.get(`${this.apiUrl}/address/txList`, {
                params: {
                    address: address,
                    count: QUERY_COUNT,
                    page: ~~(offset / QUERY_COUNT)
                }
            });
            newTransactionsData = resp.data.data || [];
            log.info('Downloading', address, `query_count:${QUERY_COUNT}|offset:${offset}|length:${newTransactionsData.length}|total:${resp.data.totalSize}`);
            if (resp.data.totalSize > config.maxTransactionsTracked) {
                throw new Error("TX_LIMIT_OVERFLOW");
            }

            result = result.concat(newTransactionsData
                .map((tx) => ({
                    hash: tx.txHash,
                    date: new Date(tx.createDate).getTime(),
                    value: tx.amount,
                    comment: `Contract: ${tx.targetContractAddr}\n${tx.errorMsg ? `errorMsg: ${errorMsg}` : 'Success!'}`,
                    from: tx.fromAddr,
                    fromAlias: tx.fromAddr,
                    to: tx.toAddr,
                    fee: tx.fee,
                    originalOpType: null,
                    type: 'supplement',
                    path: JSON.stringify({ queryCount: QUERY_COUNT, offset: (++offset) })
                }))
            );
        }

        return result;
    }

    async getVoting() {
        let total = (await axios.get(`${this.apiUrl}/iiss/prep/list`, {
            params: {
                count: 1
            }
        })).data.totalSize;
        let data = (await axios.get(`${this.apiUrl}/iiss/prep/list`, {
            params: {
                size: total
            }
        })).data.data;

        return {
            originalId: 0,
            title: 'Vote for P-Rep',
            net: 'iost',
            start_datetime: 1072915200000,
            end_datetime: null,
            answers: data.map(prep => ({
                id: prep.address,
                title: prep.name || prep.address,
                vote_count: prep.totalDelegated
            }))
        }
    }

    async prepareTransfer(fromAddress, toAddress, amount) {
        return new IconService.IconBuilder.IcxTransactionBuilder()
            .from(fromAddress)
            .to(toAddress)
            .value(IconService.IconAmount.of(amount, IconService.IconAmount.Unit.ICX).toLoop())
            .stepLimit(IconService.IconConverter.toBigNumber(100000))
            .nid(IconService.IconConverter.toBigNumber(NETWORK_ID))
            .nonce(IconService.IconConverter.toBigNumber(Date.now()))
            .version(IconService.IconConverter.toBigNumber(ICON_VERSION))
            //ICON uses nanoseconds
            .timestamp(Date.now() * 1000)
            .build();
    }

    async sendTransaction(address, signedTransaction) {
        try {
            return (await axios.post(`http://${config.icon.ip}:${config.icon.port}/api/v3`, {
                jsonrpc: "2.0",
                method: "icx_sendTransaction",
                id: 1234,
                params: signedTransaction,
            })).data;
        }
        catch (err) {
            if (err && err.response && err.response.data) {
                err = err.response.data;
            }

            if (err && err.error && err.error.message) {
                if (err.error.message.match(/\'from\' has an invalid value/)) {
                    throw new ValidationError('Invalid address');
                }
                else if (err.error.message.match(/Out of balance/)) {
                    throw new ValidationError(err.error.message);
                }
                else if (err.error.message.match(/fail tx invalid unknown/)) {
                    throw new ValidationError('Unknown error, possibly invalid signature');
                }
                throw new Error(err.error.message);
            }
            throw err;
        }
    }
}

module.exports = ICON;