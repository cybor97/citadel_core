/**
 * @author cybor97
 */
const sequelize = require('sequelize');
const Connectors = require('../connectors');
const sequelizeConnection = require('../data').getConnection();
const Address = require('../data/models/Address');
const Transaction = require('../data/models/Transaction');
const log = require('../utils/log');
const { ValidationError } = require('../utils/errors');

const config = require('../config');
const LAST_PATHS_QUERY = `
    SELECT id, "originalOpType", path, type
    FROM transactions 
    WHERE id IN (
        SELECT max(id)
        FROM transactions
        WHERE "addressId" = :addressId
        GROUP BY "originalOpType"
    );
 `;

const LAST_PATH_QUERY_NET = `
    SELECT id, "originalOpType", path, type
    FROM transactions
    WHERE transactions.currency = :net
    ORDER BY transactions.id DESC
    LIMIT 1;
 `;

const BALANCE_QUERY = `
    SELECT SUM(CASE WHEN transactions.from = :address THEN -transactions.value ELSE transactions.value END) as balance
    FROM transactions
    WHERE transactions.currency = :net AND (transactions.from = :address OR transactions.to = :address) AND NOT transactions."isCancelled";
 `;

const REWARD_QUERY = `
    SELECT SUM(CASE WHEN transactions.from = :address THEN -transactions.value ELSE transactions.value END) as reward
    FROM transactions
    WHERE transactions.currency = :net AND transactions.type IN ('payment', 'approved_payment') AND (transactions.from = :address OR transactions.to = :address) AND NOT transactions."isCancelled";
`;

const CHART_DATES_QUERY = `
    SELECT MIN(transactions.date) AS dateFrom, MAX(transactions.date) AS dateTo
    FROM transactions
    WHERE transactions.currency = :net AND (transactions.from = :address OR transactions.to = :address);
`;

const CHART_DATA_QUERY = `
    SELECT SUM(CASE WHEN transactions.from IN (:addresses) THEN -transactions.value ELSE transactions.value END) AS volume, MAX(transactions.date) AS datetime, transactions.currency AS net
    FROM transactions
    WHERE transactions.currency IN (:nets) AND (transactions.from IN (:addresses) OR transactions.to IN (:addresses))
        AND transactions.date >= :dateFrom AND transactions.date <= :dateTo
    GROUP BY transactions.date / :datePartMultiplier, transactions.currency;
`;

const CHART_DATA_QUERY_REWARD_ONLY = `
    SELECT SUM(CASE WHEN transactions.from IN (:addresses) THEN -transactions.value ELSE transactions.value END) AS volume, MAX(transactions.date) AS datetime, transactions.currency AS net
    FROM transactions
    WHERE transactions.currency IN (:nets) AND (transactions.from IN (:addresses) OR transactions.to IN (:addresses))
        AND transactions.date >= :dateFrom AND transactions.date <= :dateTo
        AND transactions.type IN ('payment', 'approved_payment')
    GROUP BY transactions.date / :datePartMultiplier, transactions.currency;
`;

const DAY_DURATION = 1000 * 3600 * 24;

class ExplorerUpdater {
    static async init() {
        let specificNet = process.argv.find(c => c.match(/^--net=/) && c);
        if (specificNet) {
            specificNet = specificNet.split('--net=')[1];
        }

        this.initConnectors();
        let connectors = this.connectors;
        //TODO: Re-implement: should run as different instances(best: 1-app, 1-updater, N-workers)
        Object.keys(connectors).forEach(async net => {
            if (specificNet && net !== specificNet) {
                return;
            }

            let serviceAddresses = await Address.findAll({
                order: [['created', 'desc']],
                where: {
                    isService: true,
                    net: net
                }
            });

            if (connectors[net].getNextBlock) {
                while (true) {
                    try {
                        let time = Date.now();
                        let lastPathsNet = await sequelizeConnection.query(LAST_PATH_QUERY_NET, {
                            replacements: { net: net },
                            type: sequelizeConnection.QueryTypes.SELECT
                        });
                        lastPathsNet = lastPathsNet && lastPathsNet.pop();
                        let preparationTime = Date.now() - time;
                        log.info(`Preparation time ${preparationTime}`);

                        let transactions = await connectors[net].getNextBlock(lastPathsNet, serviceAddresses);
                        log.info(`Fetching time ${Date.now() - time - preparationTime}`);

                        await this.saveDbTransactions(net, transactions);
                        log.info(`Iteration time ${Date.now() - time}`);

                        if (transactions.length === 0) {
                            log.info(`Sync ${net}!`);
                            await new Promise(resolve => setTimeout(resolve, config.updateInterval));
                        }
                    }
                    catch (err) {
                        log.err('getNextBlock error', err);
                        await new Promise(resolve => setTimeout(resolve, config.updateInterval));
                    }
                }
            }
            else {
                Promise.resolve().then(async () => {
                    const subscribedAddresses = new Set();
                    while (true) {
                        try {
                            let addresses = await Address.findAll({
                                limit: 1,
                                order: [['updated', 'asc']],
                                where: { net: net }
                            });
                            if (addresses.length > 0) {
                                let address = addresses[0];
                                address.updated = Date.now();
                                await address.save();

                                if (connectors[address.net].subscribe) {
                                    if (!subscribedAddresses.has(address.address)) {
                                        let lastPaths = await sequelizeConnection.query(LAST_PATHS_QUERY, {
                                            replacements: { addressId: address.id },
                                            type: sequelizeConnection.QueryTypes.SELECT
                                        });
                                        connectors[address.net]
                                            .subscribe(address.address, lastPaths)
                                            .on('data', data => this.saveDb(address, data));
                                        subscribedAddresses.add(address.address);
                                    }
                                }
                                else {
                                    await this.doWork(net, connectors[address.net], address, serviceAddresses);
                                }
                            }
                            await new Promise(resolve => setTimeout(resolve, config.updateInterval));

                        }
                        catch (err) {
                            log.err(err);
                            await new Promise(resolve => setTimeout(resolve, config.updateInterval * 2))
                        }
                    }
                });
            }
        });
    }

    static async doWork(net, connector, address, serviceAddresses, saveDb = true) {
        try {
            let transactions = [];

            let lastPaths = await sequelizeConnection.query(LAST_PATHS_QUERY, {
                replacements: { addressId: address.id },
                type: sequelizeConnection.QueryTypes.SELECT
            });

            if (serviceAddresses.length === 0
                || Date.now() - serviceAddresses[0].updated > config.bakingBadUpdateInterval) {
                if (connector.getServiceAddresses) {
                    log.info(`Updating ${net} service addresses`);
                    let newServiceAddresses = await connector.getServiceAddresses();
                    for (let newServiceAddress of newServiceAddresses) {
                        let created = await Address.findOrCreate({
                            where: { address: newServiceAddress, net: address.net },
                            defaults: {
                                net: address.net,
                                currency: address.currency,
                                address: newServiceAddress,
                                isService: true,
                                created: Date.now(),
                                updated: Date.now()
                            }
                        });
                        if (!created) {
                            Address.update({
                                updated: Date.now()
                            }, {
                                where: { address: newServiceAddress, net: address.net },
                            });
                        }
                    }
                    if (serviceAddresses.length === 0 && newServiceAddresses.length !== 0) {
                        serviceAddresses = newServiceAddresses.map(c => ({ address: c }));
                    }
                }
            }

            log.info(`Updating ${address.address} (${address.net})`);

            transactions = await connector.getAllTransactions(address.address, lastPaths, serviceAddresses.map(c => c.address));
            if (saveDb) {
                await this.saveDb(address, transactions);
            }
            return transactions;
        }
        catch (err) {
            if (err.message && err.message.match('TX_LIMIT_OVERFLOW')) {
                log.warn(`Detected ${address.address} tx limit overflow, should be exchange.`);
                address.isExchange = true;
                await address.save();
            }
            else {
                log.err(err);
            }
        }
    }

    static async saveDb(address, transactions) {
        log.info(`Pushing DB ${address.address} (${address.net}, ${transactions && transactions.length || 0} txes)`);

        const txSqlTransaction = await sequelizeConnection.transaction();
        try {
            await Promise.all(transactions.map(async tx => {
                if (process.argv.includes('-vTX')) {
                    log.info(`>tx: ${tx.hash} (${tx.type})`);
                }
                let forceUpdate = tx.forceUpdate;
                delete tx.forceUpdate;
                if (config.trustedAddresses && tx.type == 'payment' && config.trustedAddresses.includes(tx.from)) {
                    tx.type = 'approved_payment';
                }

                let created = (await Transaction.findOrCreate({
                    where: { hash: tx.hash, addressId: address.id },
                    defaults: Object.assign({ addressId: address.id }, tx),
                    transaction: txSqlTransaction
                }))[1];

                if (forceUpdate && !created) {
                    let transaction = await Transaction.findOne({
                        where: { hash: tx.hash, addressId: address.id }
                    });

                    let newTxData = Object.assign({ addressId: address.id }, tx);
                    for (let key in Object.keys(newTxData)) {
                        transaction.key = newTxData[key];
                    }
                }
            }));
            await txSqlTransaction.commit();
        }
        catch (exc) {
            log.err(`Update failed, rollback ${address.address} (${address.net})`, exc);
            await new Promise(resolve => setTimeout(resolve, config.updateInterval * 2))
            await txSqlTransaction.rollback();
        }
        address.updated = Date.now();
        await address.save();
    }

    static async saveDbTransactions(net, transactions) {
        log.info(`Pushing DB (${net}, ${transactions && transactions.length || 0} txes)`);

        const txSqlTransaction = await sequelizeConnection.transaction();
        try {
            await Promise.all(transactions.map(async tx => {
                if (process.argv.includes('-vTX')) {
                    log.info(`>tx: ${tx.hash} (${tx.type})`);
                }
                let forceUpdate = tx.forceUpdate;
                delete tx.forceUpdate;
                if (config.trustedAddresses && tx.type == 'payment' && config.trustedAddresses.includes(tx.from)) {
                    tx.type = 'approved_payment';
                }

                let created = (await Transaction.findOrCreate({
                    where: { hash: tx.hash, currency: net },
                    defaults: Object.assign({ currency: net }, tx),
                    transaction: txSqlTransaction
                }))[1];

                if (forceUpdate && !created) {
                    let transaction = await Transaction.findOne({
                        where: { hash: tx.hash, currency: net }
                    });

                    let newTxData = Object.assign({ currency: net }, tx);
                    for (let key in Object.keys(newTxData)) {
                        transaction.key = newTxData[key];
                    }
                }
            }));
            await txSqlTransaction.commit();
        }
        catch (exc) {
            log.err(`Update failed, rollback ${net}`, exc);
            await new Promise(resolve => setTimeout(resolve, config.updateInterval * 2))
            await txSqlTransaction.rollback();
        }
    }

    static initConnectors() {
        this.connectors = {};
        let connectorsModules = Connectors.getConnectors();
        for (let connectorName in connectorsModules) {
            this.connectors[connectorName] = new (connectorsModules[connectorName])();
        }
    }

    static async getBalance(net, address) {
        let data = await sequelizeConnection.query(BALANCE_QUERY, {
            type: sequelizeConnection.QueryTypes.SELECT,
            replacements: {
                net: net,
                address: address,
            }
        });

        return data.length ? data.pop() : null;
    }

    static async getReward(net, address) {
        let data = await sequelizeConnection.query(REWARD_QUERY, {
            type: sequelizeConnection.QueryTypes.SELECT,
            replacements: {
                net: net,
                address: address,
            }
        });

        return data.length ? data.pop() : null;
    }

    static async getChartDates(net, address) {
        let data = await sequelizeConnection.query(CHART_DATES_QUERY, {
            type: sequelizeConnection.QueryTypes.SELECT,
            replacements: {
                net: net,
                address: address,
            }
        });

        return data.length ? data.pop() : null;
    }

    static async getChartData(userId, net, address, dateFrom, dateTo, rewardOnly, stepOverride, interpolate) {
        let nets = new Set();
        let addresses = [];

        if (address) {
            addresses = [address];

            if (net && net != '*') {
                nets.add(net);
            }
            else {
                throw new ValidationError('net should be specified for single address');
            }
        }
        else {
            let whereParams = {
                [sequelize.Op.or]: [
                    { userIds: { [sequelize.Op.like]: `${userId}` } },
                    { userIds: { [sequelize.Op.like]: `${userId},%` } },
                    { userIds: { [sequelize.Op.like]: `%,${userId},%` } },
                    { userIds: { [sequelize.Op.like]: `%,${userId}` } }
                ]
            };

            if (net !== '*') {
                whereParams.net = net;
            }

            let addressesData = (await Address.findAll({
                where: whereParams
            }));

            if (!addressesData || !addressesData.length) {
                return [];
            }

            for (let addressData of addressesData) {
                addresses.push(addressData.address);
                nets.add(addressData.net);
            }
        }

        let step = stepOverride;
        if (!step) {
            step = this.getDatePartByDelta(dateFrom, dateTo);
        }

        let data = (await sequelizeConnection.query(rewardOnly ? CHART_DATA_QUERY_REWARD_ONLY : CHART_DATA_QUERY, {
            type: sequelizeConnection.QueryTypes.SELECT,
            replacements: {
                addresses: addresses,
                nets: Array.from(nets),
                dateFrom: dateFrom,
                dateTo: dateTo,
                datePartMultiplier: step
            }
        }))
            .sort((a, b) => parseInt(a.datetime) < parseInt(b.datetime) ? -1 : 1);

        if (interpolate && stepOverride && data.length > 0) {
            if (data.length > 1) {
                let replaced = false;
                do {
                    replaced = false;
                    for (let i = 0; i < data.length - 1; i++) {
                        if (parseInt(data[i + 1].datetime) - parseInt(data[i].datetime) > stepOverride * 2) {
                            data.splice(i + 1, 0, {
                                net: data[i].net,
                                volume: data[i].volume + (data[i + 1].volume - data[i].volume) / 2,
                                datetime: (parseInt(data[i].datetime) + (parseInt(data[i + 1].datetime) - parseInt(data[i].datetime)) / 2).toString(),
                            });
                            replaced = true;
                            break;
                        }
                    }
                }
                while (replaced);

                for (let dataItem of data) {
                    dataItem.datetime = parseInt(dataItem.datetime).toString()
                }
            }

            if (dateFrom != 0) {
                for (let time = parseInt(data[0].datetime) - step; time > dateFrom; time -= step) {
                    data.unshift({ volume: data[0].volume, net: data[0].net, datetime: time.toString() });
                }

                for (let time = parseInt(data[data.length - 1].datetime) + step; time < dateTo; time += step) {
                    data.push({ volume: data[data.length - 1].volume, net: data[data.length - 1].net, datetime: time.toString() });
                }
            }
        }

        return data;
    }

    static getDatePartByDelta(dateFrom, dateTo) {
        let delta = (dateTo - dateFrom) / DAY_DURATION;

        if (delta <= 15) {
            // return 'day';
            return DAY_DURATION;
        }

        if (delta <= 15 * 7) {
            // return 'week';
            return DAY_DURATION * 7;
        }

        if (delta <= 15 * 4 * 7) {
            // return 'month';
            return DAY_DURATION * 7 * 30;
        }

        return DAY_DURATION * 365;
    }
}

module.exports = ExplorerUpdater;
