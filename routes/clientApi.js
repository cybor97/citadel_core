/**
 * @author cybor97
 */
const sequelize = require('sequelize');
const { Router } = require('express');
const router = Router();
const config = require('../config');
const Connectors = require('../connectors');
const Address = require('../data/models/Address');
const Transaction = require('../data/models/Transaction');
const NetInfo = require('../data/models/NetInfo');
const Voting = require('../data/models/Voting');
const utils = require('../utils');
const explorerUpdater = require('../workers/explorerUpdater');
const log = require('../utils/log');
const sequelizeConnection = require('../data').getConnection();
const { ValidationError } = require('../utils/errors');

const NET_REGEX = /^[a-z-]*$/;
const ADDRESS_REGEX = /^[0-9a-zA-Z_-]*$/;

router
    /**
     * @api {get} /net Get all tracked networks
     * @apiName getNets
     * @apiGroup net
     * @apiDescription Get all tracked networks
     *  
     * @apiSuccess {Array} result [{"address": "0x1234", "updated": 1557868521022}]
     */
    .get('/', (req, res) => {
        res.status(200).send(Object.keys(Connectors.getConnectors()));
    })

    /**
     * @api {get} /net/info Get all nets info
     * @apiName getAllNetsInfo
     * @apiGroup net
     * @apiDescription Get all networks info
     * 
     * @apiParam {Array} nets ?nets[0]=a&nets[1]=b,...
     *
     * @apiSuccess {Number} priceUsd
     * @apiSuccess {Number} priceBtc
     * @apiSuccess {Number} priceUsdDelta24
     * @apiSuccess {Number} priceBtcDelta24
     * @apiSuccess {Number} yield
     * @apiSuccess {Number} marketCap
     * @apiSuccess {Number} circulatingSupply
     * @apiSuccess {Number} stakingRate
     * @apiSuccess {Number} unbondingPeriod
     */
    .get('/info', async (req, res) => {
        let connectors = Connectors.getConnectors();

        let nets = req.query.nets || Object.keys(connectors);
        let defaultNets = !req.query.nets;

        let result = [];
        for (let net of nets) {
            if (!connectors[net]) {
                return res.status(400).send({ message: `Net ${net} is not supported.` });
            }

            let connector = new connectors[net];

            if (!connector.getInfo) {
                if (defaultNets) {
                    continue;
                }
                return res.status(400).send({ message: 'Info for specified net is not yet supported.' });
            }

            let [netInfo, created] = await NetInfo.findOrCreate({
                where: { net: net },
                defaults: { net: net }
            });

            if (created || (Date.now() - netInfo.updatedAt > config.netInfoUpdateInterval)) {
                let newNetInfo = await connector.getInfo();
                newNetInfo.updatedAt = Date.now();
                netInfo = await netInfo.update(newNetInfo);
            }
            result.push(netInfo.dataValues);
        }

        res.status(200).send(result);
    })

    /**
     * @api {get} /net/:net/info Get net info
     * @apiName getNetInfo
     * @apiGroup net
     * @apiDescription Get specific network info
     *
     * @apiSuccess {Number} priceUsd
     * @apiSuccess {Number} priceBtc
     * @apiSuccess {Number} priceUsdDelta24
     * @apiSuccess {Number} priceBtcDelta24
     * @apiSuccess {Number} yield
     * @apiSuccess {Number} marketCap
     * @apiSuccess {Number} circulatingSupply
     * @apiSuccess {Number} stakingRate
     * @apiSuccess {Number} unbondingPeriod
     */
    .get('/:net/info', async (req, res) => {
        let connectors = Connectors.getConnectors();

        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }
        let connector = new connectors[req.params.net];

        if (!connector.getInfo) {
            return res.status(400).send({ message: 'Info for specified net is not yet supported.' });
        }

        let [netInfo, created] = await NetInfo.findOrCreate({
            where: { net: req.params.net },
            defaults: { net: req.params.net }
        });

        if (created || (Date.now() - netInfo.updatedAt > config.netInfoUpdateInterval)) {
            let newNetInfo = await connector.getInfo();
            newNetInfo.updatedAt = Date.now();
            netInfo = await netInfo.update(newNetInfo);
        }

        res.status(200).send(netInfo.dataValues);
    })

    /**
     * @api {get} /net/:net/address Get all tracked addresses
     * @apiName getAddresses
     * @apiGroup address
     * @apiDescription Get all tracked addresses for specific network
     * 
     * @apiParam {Number} [limit]  limit to specific count
     * @apiParam {Number} [offset] start from position
     * 
     * @apiSuccess {Array} result [{"address": "0x1234", "updated": 1557868521022}]
     */
    .get('/:net/address', async (req, res) => {
        let addresses = await Address.findAll(Object.assign({
            where: { net: req.params.net }
        }, utils.preparePagination(req.query)));
        res.status(200).send(addresses.map(c => ({ address: c.address, updated: c.updated })));
    })

    /**
     * @api {get} /net/:net/address/:address Get specific address data
     * @apiName getAddress
     * @apiGroup address
     * @apiDescription Get specific address data with optional pagination, currency filter and dates.
     * If not exists - updated and created will be null
     * Transaction type: 
     * supplement, conclusion, delegation, delegate_change, delegate_remove, payment, approved_payment
     * 
     * @apiParam {String} [currency]     currency, same as net by default
     * @apiParam {Number} [date_from]    transactions from(timestamp)
     * @apiParam {Number} [date_to]      transactions to(timestamp)
     * @apiParam {Number} [limit]        limit to specific count
     * @apiParam {Number} [offset]       start from position
     * 
     * @apiSuccess {String} address      address in network
     * @apiSuccess {String} net          net   
     * @apiSuccess {String} currency     currency
     * @apiSuccess {Number} updated      updated at date
     * @apiSuccess {Number} created      created at date
     * @apiSuccess {Array} transactions [{
     *    "hash": "0x123456", 
     *    "date": 1557868521022, 
     *    "value": 123, 
     *    "from":"0x1234", 
     *    "to": "0x4321", 
     *    "fee": 0.1, 
     *    "type": "supplement",
     *    "comment": ""
     * }]
     * @apiSuccess {Number} transactionsCount count of all matching transactions
     * @apiSuccess {Number} forceUpdate 1/0 forced update data for address
     */
    .get('/:net/address/:address', async (req, res) => {
        if (!NET_REGEX.test(req.params.net)) {
            return res.status(400).send({ message: 'Invalid net format!' });
        }

        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = new connectors[req.params.net]();
        if (!ADDRESS_REGEX.test(req.params.address) || !connector.validateAddress(req.params.address)) {
            return res.status(400).send({ message: 'Invalid address format!' });
        }

        try {
            let address = (await Address.findOrCreate({
                where: { net: req.params.net, address: req.params.address },
                defaults: {
                    address: req.params.address,
                    net: req.params.net,
                    currency: req.params.net,
                    updated: null,
                    created: Date.now()
                }
            }))[0];

            // let whereParams = {[sequelize.Op.or]: [{from: req.params.address}, {to: req.params.address}]};
            let whereParams = {};
            if (req.query.currency) {
                whereParams.currency = req.query.currency;
            }
            if (req.query.date_from) {
                whereParams.date = { [sequelize.Op.gte]: req.query.date_from };
            }
            if (req.query.date_to) {
                whereParams.date = { [sequelize.Op.lte]: req.query.date_to };
            }

            if (req.params.net === 'orbs') {
                whereParams.value = { [sequelize.Op.ne]: 0 };
            }

            let transactions = await Transaction.findAndCountAll(Object.assign({
                attributes: ['hash', 'date', 'value', 'feeBlockchain', 'gasUsed', 'ramUsed', 'from', 'to', 'fee', 'type', 'comment', 'isCancelled'],
                where: whereParams,
                include: [{ model: Address, where: { address: req.params.address } }]
            }, utils.preparePagination(req.query)));

            if (!transactions.length && req.query.forceUpdate
                //FIXME: Remove ASAP(as subscriptions brought to work)
                || req.params.net === 'orbs' || req.params.net === 'iost') {
                let serviceAddresses = await Address.findAll({
                    order: [['created', 'desc']],
                    where: {
                        isService: true,
                        net: req.params.net
                    }
                });

                await explorerUpdater.doWork(req.params.net, connector, address, serviceAddresses);

                transactions = await Transaction.findAndCountAll(Object.assign({
                    attributes: ['hash', 'date', 'value', 'feeBlockchain', 'gasUsed', 'ramUsed', 'from', 'to', 'fee', 'type', 'comment', 'isCancelled'],
                    where: whereParams,
                    include: [{ model: Address, where: { address: req.params.address } }]
                }, utils.preparePagination(req.query)));
            }

            address = address.dataValues;
            address.transactions = transactions.rows.map(tx => {
                let txData = tx.dataValues;
                //FIXME: ASAP, should be processed on collection
                if (tx.type === 'supplement' && txData.from && txData.from.toLowerCase() === req.params.address.toLowerCase()) {
                    txData.type = 'conclusion';
                }

                delete txData.address;

                return txData;
            });
            address.transactionsCount = transactions.count;

            res.status(200).send(address);
        }
        catch (err) {
            log.err(err);
            res.status(500).send({ err: err.message, stack: err.stack });
        }
    })

    /**
     * @api {get} /net/:net/address/:address/info Get specific address info
     * @apiName getAddressInfo
     * @apiGroup address
     * @apiDescription Get specific address info.
     */
    .get('/:net/address/:address/info', async (req, res) => {
        if (!NET_REGEX.test(req.params.net)) {
            return res.status(400).send({ message: 'Invalid net format!' });
        }

        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = new connectors[req.params.net]();
        if (!ADDRESS_REGEX.test(req.params.address) || !connector.validateAddress(req.params.address)) {
            return res.status(400).send({ message: 'Invalid address format!' });
        }

        let [address, created] = (await Address.findOrCreate({
            where: { net: req.params.net, address: req.params.address },
            defaults: {
                address: req.params.address,
                net: req.params.net,
                currency: req.params.net,
                updated: null,
                created: Date.now()
            }
        }));
        if (created) {
            try {
                await explorerUpdater.doWork(req.params.net, connector, address, []);
            }
            catch (err) {
                if (err.message && err.message.match('TX_LIMIT_OVERFLOW')) {
                    log.warn(`Detected ${address.address} tx limit overflow, should be exchange.`);
                    address.isExchange = true;
                    address = await address.save();
                }
            }
        }
        return res.status(200).send(address.dataValues);
    })

    /**
     * @api {delete} /net/:net/address/:address Remove address
     * @apiName removeAddress
     * @apiGroup address
     * @apiDescription Remove address and stop tracking
     * 
     * @apiSuccess {Boolean} success completed successfully
     */
    .delete('/:net/address/:address', async (req, res) => {
        let address = (await Address.findOne({
            where: { net: req.params.net, address: req.params.address },
        }));
        if (address !== null) {
            address.destroy();
            res.status(200).send({ success: true });
        }
        else {
            res.status(404).send({ message: 'Address not found' });
        }
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-reveal Prepare reveal
     * @apiName prepareReveal
     * @apiGroup sendTransaction
     * @apiDescription Prepare reveal transaction
     * 
     * @apiParam {String} toAddress Target address 
     * @apiParam {Number} amount    Transfer amount 
     * 
     * @apiSuccess transaction Prepared transaction
     */
    .post('/:net/address/:address/transactions/prepare-reveal', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.prepareReveal) {
            return res.status(400).send({ message: "Specified net doesn't support reveal or not yet implemented." });
        }

        if (connector.isRevealed && await connector.isRevealed(req.params.address)) {
            return res.status(400).send({ message: "Specified address already revealed." });
        }

        let transaction = await connector.prepareReveal(req.params.address);

        res.status(200).send(transaction);
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-transfer Prepare transfer
     * @apiName prepareTransfer
     * @apiGroup sendTransaction
     * @apiDescription Prepare transfer transaction
     * 
     * @apiParam {String} toAddress Target address 
     * @apiParam {Number} amount    Transfer amount 
     * 
     * @apiSuccess transaction Prepared transaction, specific for each net({opbytes, opOb} for tezos, {to,data(abi),gas,nonce(tx count), gasPrice, chainId} for eth tokens)
     */
    .post('/:net/address/:address/transactions/prepare-transfer', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.prepareTransfer) {
            return res.status(400).send({ message: "Specified net doesn't support transfer or not yet implemented." });
        }

        let transaction = await connector.prepareTransfer(req.params.address, req.body.toAddress, req.body.amount);

        res.status(200).send(transaction);
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-sign-up Prepare sign up
     * @apiName prepareSignUp
     * @apiGroup sendTransaction
     * @apiDescription Prepare sign up transaction
     * 
     * @apiParam {String} name    Target account name 
     * @apiParam {Number} pubKey  Target account public key
     * @apiParam {Number} [gas]   Pledge gas for new account
     * @apiParam {Number} [ram]   Pledge ram for new account
     * 
     * @apiSuccess transaction Prepared transaction, specific for each net({opbytes, opOb} for tezos, {to,data(abi),gas,nonce(tx count), gasPrice, chainId} for eth tokens)
     */
    .post('/:net/address/:address/transactions/prepare-sign-up', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.prepareSignUp) {
            return res.status(400).send({ message: "Specified net doesn't support signing up new accounts or not yet implemented." });
        }

        if (!req.body.name) {
            return res.status(400).send({ message: 'Name should be defined' });
        }

        if (!req.body.pubKey) {
            return res.status(400).send({ message: 'Public key for new account should be defined' });
        }

        let transaction = await connector.prepareSignUp(req.params.address, req.body.name, req.body.pubKey, req.body.gas || 0, req.body.ram || 0);

        res.status(200).send(transaction);
    })

    /**
    * @api {post} /net/:net/faucet-sign-up Faucet sign up
    * @apiName faucetSignUp
    * @apiGroup sendTransaction
    * @apiDescription Faucet sign up
    * 
    * @apiParam {String} name    Target account name 
    * @apiParam {Number} pubKey  Target account public key
    * 
    * @apiSuccess transaction Faucet sign up
    */
    .post('/:net/faucet-sign-up', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.faucetSignUp) {
            return res.status(400).send({ message: "Specified net doesn't support signing up new accounts or not yet implemented." });
        }

        if (!req.body.name) {
            return res.status(400).send({ message: 'Name should be defined' });
        }

        if (!req.body.pubKey) {
            return res.status(400).send({ message: 'Public key for new account should be defined' });
        }

        let hash = await connector.faucetSignUp(req.body.name, req.body.pubKey);

        res.status(200).send({ hash: hash });
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-pledge Prepare gas pledge
     * @apiName preparePledge
     * @apiGroup sendTransaction
     * @apiDescription Prepare gas pledge transaction
     * 
     * @apiParam {String} toAddress Target address 
     * @apiParam {Number} amount    Amount 
     * 
     * @apiSuccess transaction Prepared transaction, specific for each net({opbytes, opOb} for tezos, {to,data(abi),gas,nonce(tx count), gasPrice, chainId} for eth tokens)
     */
    .post('/:net/address/:address/transactions/prepare-pledge', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());

        if (!connector.preparePledge) {
            return res.status(400).send({ message: "Specified net doesn't support gas pledge or not yet implemented." });
        }

        res.status(200).send(await connector.preparePledge(req.params.address, req.body.toAddress, req.body.amount));
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-unpledge Prepare gas unpledge
     * @apiName prepareUnpledge
     * @apiGroup sendTransaction
     * @apiDescription Prepare gas unpledge transaction
     * 
     * @apiParam {String} toAddress Target address 
     * @apiParam {Number} amount    Amount 
     * 
     * @apiSuccess transaction Prepared transaction, specific for each net({opbytes, opOb} for tezos, {to,data(abi),gas,nonce(tx count), gasPrice, chainId} for eth tokens)
     */
    .post('/:net/address/:address/transactions/prepare-unpledge', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.prepareUnpledge) {
            return res.status(400).send({ message: "Specified net doesn't support gas unpledge or not yet implemented." });
        }


        res.status(200).send(await connector.prepareUnpledge(req.params.address, req.body.toAddress, req.body.amount));
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-buy-ram Prepare buy ram
     * @apiName prepareBuyRam
     * @apiGroup sendTransaction
     * @apiDescription Prepare buy ram transaction
     * 
     * @apiParam {String} toAddress Target address 
     * @apiParam {Number} amount    Amount 
     * 
     * @apiSuccess transaction Prepared transaction, specific for each net({opbytes, opOb} for tezos, {to,data(abi),gas,nonce(tx count), gasPrice, chainId} for eth tokens)
     */
    .post('/:net/address/:address/transactions/prepare-buy-ram', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.prepareBuyRam) {
            return res.status(400).send({ message: "Specified net doesn't support buy ram or not yet implemented." });
        }

        res.status(200).send(await connector.prepareBuyRam(req.params.address, req.body.toAddress, req.body.amount));
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-sell-ram Prepare sell ram
     * @apiName prepareSellRam
     * @apiGroup sendTransaction
     * @apiDescription Prepare sell ram transaction
     * 
     * @apiParam {String} toAddress Target address 
     * @apiParam {Number} amount    Amount 
     * 
     * @apiSuccess transaction Prepared transaction, specific for each net({opbytes, opOb} for tezos, {to,data(abi),gas,nonce(tx count), gasPrice, chainId} for eth tokens)
     */
    .post('/:net/address/:address/transactions/prepare-sell-ram', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.prepareSellRam) {
            return res.status(400).send({ message: "Specified net doesn't support sell ram or not yet implemented." });
        }

        res.status(200).send(await connector.prepareSellRam(req.params.address, req.body.toAddress, req.body.amount));
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-delegation Prepare delegation. Warning: can be 100% balance for some networks!
     * @apiName prepareDelegation
     * @apiGroup sendTransaction
     * @apiDescription Prepare delegation transaction
     * 
     * @apiParam {String} toAddress Target address 
     * 
     * @apiSuccess transaction Prepared transaction, specific for each net({opbytes, opOb} for tezos, {to,data(abi),gas,nonce(tx count), gasPrice, chainId} for eth tokens). 
     */
    .post('/:net/address/:address/transactions/prepare-delegation', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.prepareDelegation) {
            return res.status(400).send({ message: "Specified net doesn't support delegation or not yet implemented." });
        }

        let transaction = await connector.prepareDelegation(req.params.address, req.body.toAddress);

        res.status(200).send(transaction);
    })

    /**
     * @api {post} /net/:net/address/:address/transactions/prepare-origination Prepare origination
     * @apiName prepareOrigination
     * @apiGroup sendTransaction
     * @apiDescription Prepare origination transaction
     * 
     * @apiParam {String} balance Target wallet balance 
     * 
     * @apiSuccess transaction Prepared transaction, specific for each net({opbytes, opOb} for tezos)
     */
    .post('/:net/address/:address/transactions/prepare-origination', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.prepareOrigination) {
            return res.status(400).send({ message: "Specified net doesn't support origination or not yet implemented." });
        }

        let transaction = await connector.prepareOrigination(req.params.address, req.body.balance);

        res.status(200).send(transaction);
    })


    /**
     * @api {post} /net/:net/address/:address/transactions/send Send signed transaction
     * @apiName sendTransaction
     * @apiGroup sendTransaction
     * @apiDescription Send signed transaction
     * 
     * @apiParam {String} signedTransaction Signed transaction 
     * 
     * @apiSuccess {Boolean} success completed successfully
     */
    .post('/:net/address/:address/transactions/send', async (req, res) => {
        let connectors = Connectors.getConnectors();
        let connector = (new connectors[req.params.net]());
        try {
            let result = await connector.sendTransaction(req.params.address, req.body.signedTransaction);
            res.status(200).send(result);
        }
        catch (exc) {
            if (exc instanceof ValidationError) {
                res.status(400).send({ message: exc.message });
            }
            else {
                if (typeof (exc) === 'string') {
                    try {
                        exc = JSON.parse(exc);
                    }
                    catch{ }
                }
                res.status(500).send(exc && ((typeof (exc) === 'string' && exc) || exc.message || (exc.length && exc[0] && exc[0].msg) || exc.name));
            }
        }
    })

    /**
     * @api {get} /net/:net/address/:address/transactions/:hash/check Check transaction
     * @apiName checkTransaction
     * @apiGroup checkTransaction
     * @apiDescription Check transaction
     * 
     * @apiSuccess transaction {status: 'ok|failed|unexist', reason: '...'}
     */
    .get('/:net/address/:address/transactions/:hash/check', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.checkTransaction) {
            return res.status(400).send({ message: "Check transaction is not yet implemented for specified net." });
        }

        let checkResult = await connector.checkTransaction(req.params.address, req.params.hash);

        res.status(200).send(checkResult);
    })


    /**
     * @api {get} /net/voting Get all votings
     * @apiName getAllVoting
     * @apiGroup vote
     * @apiDescription Get all votings for supported network
     * 
     * @apiParam   {Array}   nets              nets, to fetch votings for
     * @apiParam   {Boolean} is_active         votings, where end_datetime >= current time
     *
     * @apiSuccess {String} count          voting ID(block number for tezos)
     * @apiSuccess {Array}  results        [{id, title, net, start_datetime, end_datetime, answers}]
     */
    .get('/voting', async (req, res) => {
        let connectors = Connectors.getConnectors();
        let nets = req.query.nets;

        let votingData = [];
        for (let net in connectors) {
            if (!nets || nets.includes(net)) {
                let connector = new connectors[net]();
                if (connector.getVoting) {
                    let lastUpdate = await Voting.max('updatedAt', { where: { net: net } });
                    let votings = [];

                    try {
                        if (!lastUpdate || Date.now() - lastUpdate > config.votingUpdateInterval) {
                            votings = await connector.getVoting();
                        }
                        if (!(votings instanceof Array)) {
                            votings = [votings];
                        }

                        const sqlTransaction = await sequelizeConnection.transaction();
                        for (let votingItem of votings) {
                            await Voting.upsert(Object.assign(votingItem, { updatedAt: Date.now() }), {
                                where: {
                                    originalId: votingItem.originalId,
                                    net: net
                                },
                                transaction: sqlTransaction
                            })
                        }
                        await sqlTransaction.commit();
                    }
                    catch (err) {
                        log.err('Get all nets voting error', err);
                    }

                    votings = (await Voting.findAll({ where: { net: net } })).map(c => c.dataValues);

                    if (votings && votings.length) {
                        votingData = votingData.concat(votings);
                    }
                    else {
                        log.err(`Nothing get for voting(net: ${net})`);
                    }
                }
            }
        }

        res.status(200).send({
            count: votingData.length,
            results: votingData
        });
    })

    /**
     * @api {get} /net/:net/voting Get current voting
     * @apiName getVoting
     * @apiGroup vote
     * @apiDescription Get current lasting voting
     *
     * @apiSuccess {Number} id                voting ID(protocol hash for tezos)
     * @apiSuccess {String} title             voting title
     * @apiSuccess {String} net               net
     * @apiSuccess {Number} start_datetime    start voting timestamp
     * @apiSuccess {Number} end_datetime      estimated end voting timestamp
     * @apiSuccess {Array}  answers           {"id":1, "title": "answer title", "vote_count": 123}
     */
    .get('/:net/voting', async (req, res) => {
        let connectors = Connectors.getConnectors();
        let net = req.params.net;

        if (!connectors[net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = new connectors[net];
        if (!connector.getVoting) {
            return res.status(400).send({ message: 'Voting for specified net is not yet supported.' });
        }

        let lastUpdate = await Voting.max('updatedAt', { where: { net: net } });
        let votings = [];

        try {
            if (!lastUpdate || Date.now() - lastUpdate > config.votingUpdateInterval) {
                votings = await connector.getVoting();
            }
            if (!(votings instanceof Array)) {
                votings = [votings];
            }

            const sqlTransaction = await sequelizeConnection.transaction();
            for (let votingItem of votings) {
                await Voting.upsert(Object.assign(votingItem, { updatedAt: Date.now() }), {
                    where: {
                        originalId: votingItem.originalId,
                        net: net
                    },
                    transaction: sqlTransaction
                })
            }
            await sqlTransaction.commit();
        }
        catch (err) {
            log.err('Get all nets voting error', err);
        }

        votings = (await Voting.findAll({ where: { net: net } })).map(c => c.dataValues);

        res.status(200).send(votings);
    })

    /**
     * @api {post} /net/:net/voting/submit-proposal Submit proposal
     * @apiName submitProposal
     * @apiGroup vote
     * @apiDescription Submit voting proposal
     *
     * @apiParam {String} votingId Voting ID
     * @apiParam {String} delegate Delegate address
     * @apiParam {String} proposal Proposal
     * 
     * @apiSuccess {Object} result {"rawTransaction": "0xfedcba987654321"}
     */
    .post('/:net/voting/submit-proposal', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = new connectors[req.params.net];
        if (!connector.prepareProposal) {
            return res.status(400).send({ message: 'Proposal for specified net is not yet supported.' });
        }

        let transaction = await connector.prepareProposal(req.body.votingId, req.body.delegate, req.body.proposal);

        res.status(200).send(transaction);
    })

    /**
     * @api {post} /net/:net/voting/submit-ballot Submit ballot
     * @apiName submitBallot
     * @apiGroup vote
     * @apiDescription Submit voting ballot
     *
     * @apiParam {String} votingId Voting ID
     * @apiParam {String} delegate Delegate address
     * @apiParam {String} ballot Chosen ballot
     * 
     * @apiSuccess {Object} result {"rawTransaction": "0xfedcba987654321"}
     */
    .post('/:net/voting/submit-ballot', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = new connectors[req.params.net];
        if (!connector.prepareBallot) {
            return res.status(400).send({ message: 'Ballot for specified net is not yet supported.' });
        }
        let transaction = await connector.prepareBallot(req.body.votingId, req.body.delegate, req.body.ballot);

        res.status(200).send(transaction);
    })

    /**
     * @api {post} /net/:net/address/:address/delegation-balance-info Delegation balance info
     * @apiName delegationBalanceInfo
     * @apiGroup delegationBalanceInfo
     * @apiDescription Get delegation balance info
     *
     * @apiParam {String} net NET
     * @apiParam {String} address Address
     * 
     * @apiSuccess {number} mainBalance
     * @apiSuccess {number} delegatedBalance
     * @apiSuccess {array} originatedAddresses
     */
    .get('/:net/address/:address/delegation-balance-info', async (req, res) => {
        let connectors = Connectors.getConnectors();
        if (!connectors[req.params.net]) {
            return res.status(400).send({ message: 'Specified net is not supported!' });
        }

        let connector = (new connectors[req.params.net]());
        if (!connector.getDelegationBalanceInfo) {
            return res.status(400).send({ message: 'Delegation balance info for specified net is not yet supported.' });
        }

        if (connector.validateDelegationAddress) {
            let addressValidation = await connector.validateDelegationAddress(req.params.address);
            if (!addressValidation.valid) {
                return res.status(400).send({ message: addressValidation.message });
            }
        }

        res.status(200).send(await connector.getDelegationBalanceInfo(req.params.address));
    });

module.exports = router;
