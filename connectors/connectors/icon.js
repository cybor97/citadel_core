const axios = require('axios');
const IconService = require('icon-sdk-js');
const http = require('http');
const https = require('https');
const ZabbixSender = require('node-zabbix-sender');

const BaseConnector = require('./baseConnector');
const config = require('../../config');
const log = require('../../utils/log');
const { ValidationError } = require('../../utils/errors');
const Messari = require('../messari');

const QUERY_COUNT = 50;
//1 - mainnet, 2 - exchanges testnet, 3 - D-Apps testnet
const NETWORK_ID = 1;
const ICON_VERSION = 3;
const ICON_MULTIPLIER = Math.pow(10, 18);
//0.3ICX
const ICX_PRESERVE = 0x29A2241AF62C0000 / 10;
//5 seconds, ICON uses nanoseconds
const ICX_TX_DELAY = 5000000;

class ICON extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = 'https://tracker.icon.foundation/v3';
        this.apiWalletUrl = `http://${config.icon.ip}:${config.icon.port}/api/v3`;;

        this.axiosClient = axios.create({
            timeout: 10000,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true })
        });
        this.zabbixSender = new ZabbixSender({
            host: config.zabbix.ip,
            port: config.zabbix.port,
            items_host: 'CitadelConnectorICON'
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

    async getNextBlock(lastPathsNet, serviceAddresses) {
        let path = lastPathsNet && lastPathsNet.path;
        if (typeof (path) === 'string') {
            path = JSON.parse(path);
        }
        let blockNumber = path && path.blockNumber != null ? path.blockNumber + 1 : 0;
        log.info(`fromBlock ${blockNumber}`);

        let transactions = null;

        while (!transactions || !transactions.length) {
            let response = await this.axiosClient.post(this.apiWalletUrl, {
                jsonrpc: "2.0",
                method: "icx_getBlockByHeight",
                id: 1234,
                params: {
                    height: `0x${blockNumber.toString(16)}`
                }
            });
            let blockTimestamp = response.data.result.time_stamp / 1000;
            transactions = response.data.result.confirmed_transaction_list;

            transactions = transactions
                .map((tx) => ({
                    hash: tx.tx_hash || tx.txHash || '0x0',
                    date: blockTimestamp,
                    value: parseInt(tx.value || tx.amount || 0) / ICON_MULTIPLIER,
                    comment: tx.message,
                    from: tx.from,
                    fromAlias: tx.from,
                    to: tx.to,
                    fee: parseInt(tx.fee || 0) / ICON_MULTIPLIER,
                    originalOpType: tx.data && tx.data.method,
                    type: tx.data && tx.data.method == 'setDelegation' ? 'delegation' : 'supplement',
                    path: JSON.stringify({ blockNumber: response.data.result.height })
                }));
            for (let tx of transactions) {
                if (blockNumber === 0) {
                    tx.isCancelled = false;
                    continue;
                }

                let transactionResult = await axios.post(this.apiWalletUrl, {
                    jsonrpc: "2.0",
                    method: "icx_getTransactionResult",
                    id: 1234,
                    params: {
                        txHash: tx.hash.startsWith('0x') ? tx.hash : `0x${tx.hash}`
                    }
                });

                transactionResult = transactionResult.data.result;
                //In ICX 0 means error
                tx.isCancelled = parseInt(transactionResult.status) === 0;
            }

            blockNumber++;
        }

        try {
            await this.sendZabbix({
                prevBlockNumber: path ? path.blockNumber : 0,
                blockNumber: blockNumber,
                blockTransactions: transactions ? transactions.length : 0
            });
        }
        catch (err) {
            log.err('sendZabbix', err);
        }


        return transactions;
    }

    async getInfo() {
        return Object.assign(await Messari.getInfo('icon'), {
            yield: 22.84,
            unbondingPeriod: '13 days'
        });
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
            net: 'icon',
            //https://medium.com/helloiconworld/icon-mainnet-1-0-launched-d54b9132017e
            start_datetime: 1516818300000,
            end_datetime: null,
            answers: data.map(prep => ({
                id: prep.address,
                title: prep.name || prep.address,
                vote_count: parseInt(prep.totalDelegated)
            }))
        }
    }

    async getDelegationBalanceInfo(address) {
        let iconService = new IconService(new IconService.HttpProvider(this.apiWalletUrl));
        let balance = parseInt(await iconService.getBalance(address).execute());
        let stakedBalance = await iconService.call(new IconService.IconBuilder.CallBuilder()
            .to('cx0000000000000000000000000000000000000000')
            .method('getStake')
            .params({ address: address })
            .build()
        ).execute();
        balance += parseInt(stakedBalance.stake) + parseInt(stakedBalance.unstake);
        let delegation = await iconService.call(new IconService.IconBuilder.CallBuilder()
            .to('cx0000000000000000000000000000000000000000')
            .method('getDelegation')
            .params({ address: address })
            .build()
        ).execute();

        return {
            mainBalance: balance / ICON_MULTIPLIER,
            delegatedBalance: parseInt(delegation.totalDelegated) / ICON_MULTIPLIER,
            originatedAddresses: delegation.delegations.map(c => c.address)
        }
    }


    async prepareDelegation(fromAddress, toAddress) {
        let { IconBuilder, HttpProvider } = IconService;
        let iconService = new IconService(new HttpProvider(this.apiWalletUrl));
        let claimIScoreTransaction = null;
        let setStakeTransaction = null;
        let setDelegationTransaction = null;

        //STEP 1: SHOULD BE LARGER THAN 1
        let claimableICX = await iconService.call(new IconBuilder.CallBuilder()
            .to('cx0000000000000000000000000000000000000000')
            .method('queryIScore')
            .params({ address: fromAddress })
            .build()
        ).execute();

        if (parseInt(claimableICX.estimatedICX) >= 1) {
            //STEP 2: CLAIM AVAILABLE ISCORE
            claimIScoreTransaction = new IconBuilder.CallTransactionBuilder()
                .from(fromAddress)
                .to('cx0000000000000000000000000000000000000000')
                .version('0x3')
                .nid('0x1')
                .nonce('0x0')
                .value('0x0')
                .stepLimit(IconService.IconConverter.toBigNumber(108000))
                .timestamp(Date.now() * 1000)
                .method('claimIScore')
                .build();
        }

        //STEP 3: GET AVAILABLE BALANCE FOR STAKING
        let balance = await iconService.getBalance(fromAddress).execute();

        //STEP 4: GET ALREADY STAKED BALANCE
        let stakedBalance = await iconService.call(new IconBuilder.CallBuilder()
            .to('cx0000000000000000000000000000000000000000')
            .method('getStake')
            .params({ address: fromAddress })
            .build()
        ).execute();

        let valueToStake = balance.toNumber() - ICX_PRESERVE + parseInt(stakedBalance.stake);

        if (valueToStake > ICX_PRESERVE) {
            //STEP 5: STAKE ALL AVAILABLE BALANCE
            setStakeTransaction = new IconBuilder.CallTransactionBuilder()
                .from(fromAddress)
                .to('cx0000000000000000000000000000000000000000')
                .version('0x3')
                .nid('0x1')
                .nonce('0x0')
                .value('0x0')
                .method('setStake')
                //TODO: Review
                .stepLimit(IconService.IconConverter.toBigNumber(125000))
                .timestamp(Date.now() * 1000 + ICX_TX_DELAY)
                .params({ value: `0x${valueToStake.toString(16)}` })
                .build();
        }

        //STEP 6: CHECK VOTING POWER
        let votingPowerTotal = await iconService.call(new IconBuilder.CallBuilder()
            .to('cx0000000000000000000000000000000000000000')
            .method('getStake')
            .params({ address: fromAddress })
            .build()
        ).execute();


        //STEP 7: VOTE FOR ADDRESS
        setDelegationTransaction = new IconBuilder.CallTransactionBuilder()
            .from(fromAddress)
            .to('cx0000000000000000000000000000000000000000')
            .version('0x3')
            .nid('0x1')
            .nonce('0x0')
            .value('0x0')
            .stepLimit(IconService.IconConverter.toBigNumber(125000 + 25000/**single delegation*/))
            .timestamp(Date.now() * 1000 + ICX_TX_DELAY * 2)
            .method('setDelegation')
            .params({
                delegations: [{
                    address: toAddress,
                    value: votingPowerTotal.stake.toString(16)
                }]
            })
            .build();

        return [claimIScoreTransaction, setStakeTransaction, setDelegationTransaction].filter(Boolean);
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
            if (signedTransaction instanceof Array) {
                let hashes = [];
                for (let tx of signedTransaction) {
                    hashes.push(await this.sendTransaction(address, tx));
                }
                return { hash: hashes };
            }
            else {
                return {
                    hash: (await axios.post(`http://${config.icon.ip}:${config.icon.port}/api/v3`, {
                        jsonrpc: "2.0",
                        method: "icx_sendTransaction",
                        id: 1234,
                        params: signedTransaction,
                    })).data.result
                };
            }
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