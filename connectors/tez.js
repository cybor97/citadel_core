const axios = require('axios');
const eztz = require('eztz.js');
const BaseConnector = require('./baseConnector');
const config = require('../config');

const M_TEZ_MULTIPLIER = 1000000;
const QUERY_COUNT = 50;
const OP_TYPES = [
    {type: 'origination', sourceType: 'Origination'},
    {type: 'supplement', sourceType: 'Transaction'},
    {type: 'delegation', sourceType: 'Delegation'},
]

class TEZ extends BaseConnector {
    constructor(){
        super();
        this.apiUrl = 'https://api1.tzscan.io/v3';
        this.bakingBadUrl = 'https://baking-bad.org/js/app.4215520e.js';

        let rpcUrl = `http://${config.tezos.ip}:${config.tezos.port}`;
        eztz.eztz.node.setProvider(rpcUrl);
        this.eztzInstance = eztz.eztz;
    }

    validateAddress(address){
        return !!address.match(/^(tz|KT)[a-zA-Z0-9]*$/);
    }

    async getServiceAddresses(){
        let data = (await axios.get(this.bakingBadUrl)).data;
        let tzAddressMatches = data.match(/(tz|KT)([a-zA-Z0-9]{34}): *{ *name/g)
                                   .map(c => c.match(/(tz|KT)([a-zA-Z0-9]{34})/)[0]);
        let uniqueMatches = [];
        for(let address of tzAddressMatches){
            if(uniqueMatches.indexOf(address) === -1){
                uniqueMatches.push(address);
            }
        }
        return uniqueMatches;
    }

    /**
     * Get all transactions for address
     * @param {String} address 
     */
    async getAllTransactions(address, lastPaths, serviceAddresses){
        let result = {};

        for(let opType of OP_TYPES){
            let transactionsCount = (await axios.get(`${this.apiUrl}/number_operations/${address}`, {
                params: {
                    type: opType.sourceType
                }
            })).data[0];
            let transactions = [];
            let offset = 0;
            for(let tx of lastPaths){
                if(tx.originalOpType === opType.sourceType && tx.path &&
                    (opType.type === 'delegation' || opType === 'origination')){
                        offset = JSON.parse(tx.path).offset;
                }
            }

            while(transactions.length < transactionsCount){
                let newTransactions = (await axios.get(`${this.apiUrl}/operations/${address}`,{
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
                        value: ((txData.amount||txData.balance) / M_TEZ_MULTIPLIER) || 0,
                        from: txData.src.tz,
                        fromAlias: txData.src.alias,
                        to: to,
                        fee: txData.fee / M_TEZ_MULTIPLIER,
                        originalOpType: opType.sourceType,
                        type: opType.type,
                        path: JSON.stringify({queryCount: QUERY_COUNT, offset: offset})
                    };
                })
                transactions = transactions.concat(newTransactions);
                offset++;
            }

            result[opType.type] = transactions;
        }

        //Unprocessed payments/conclusions are supplements by default
        this.processPayment([].concat(result.supplement, result.origination||[]), serviceAddresses);

        return [].concat(...Object.values(result));
    }

    async processPayment(transactions, serviceAddresses){
        transactions.forEach(tx => {
            if(tx.fromAlias || serviceAddresses.indexOf(tx.from) !== -1){
                tx.type = 'payment';
            }
            else if(tx.type == 'origination'){
                tx.type = 'supplement';
            }
        });
    }

    async prepareTransfer(fromAddress, toAddress, amount){
        return await this.eztzInstance.rpc.prepareOperation(fromAddress, {
            kind: 'transaction',
            fee: '1420',
            gas_limit: '10100',
            storage_limit: '0',
            amount: (Number(amount) * M_TEZ_MULTIPLIER).toString(),
            destination: toAddress
        }, false);
    }

    async prepareDelegation(fromAddress, toAddress){
        return await this.eztzInstance.rpc.prepareOperation(fromAddress, {
            kind: 'delegation',
            fee: '1420',
            gas_limit: '10100',
            storage_limit: '0',
            delegate: toAddress
        }, false).catch(err => err);
    }

    async sendTransaction(address, signedTransaction){
        return await this.eztzInstance.rpc.inject(signedTransaction.opOb, signedTransaction.sopbytes);
    }
}

module.exports = TEZ;