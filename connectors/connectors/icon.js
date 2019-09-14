const axios = require('axios');
const BaseConnector = require('./baseConnector');

const QUERY_COUNT = 50;

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
            newTransactionsData = resp.data.data;
            console.log('Downloading', address, `query_count:${QUERY_COUNT}|offset:${offset}|length:${newTransactionsData.length}|total:${resp.data.totalSize}`);
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
}

module.exports = ICON;