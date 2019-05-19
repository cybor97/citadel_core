/**
 * @author cybor97
 */
const sequelize = require('sequelize');
const { Router } = require('express');
const router = Router();
const Connectors = require('../connectors');
const Address = require('../data/models/Address');
const Transaction = require('../data/models/Transaction');

router
/**
 * @api {get} /net Get all tracked networks
 * @apiName getAddresses
 * @apiGroup net
 * @apiDescription Get all tracked networks
 * 
 * @apiParam {Number} [limit]  limit to specific count
 * @apiParam {Number} [offset] start from position
 * 
 * @apiSuccess {Array} result [{"address": "0x1234", "updated": 1557868521022}]
 */
.get('/', (req, res) => {

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
    let addresses = await Address.findAll({
        where: {net: req.params.net},
        limit: req.query.limit || null,
        offset: req.query.offset || null
    });
    res.status(200).send(addresses.map(c=>({address: c.address, updated: c.updated})));
}) 

/**
 * @api {get} /net/:net/address/:address Get specific address data
 * @apiName getAddress
 * @apiGroup address
 * @apiDescription Get specific address data with optional pagination, currency filter and dates.
 * If not exists - updated and created will be null
 * Transaction type: 
 * supplement, conclusion, delegation, delegate_change, delegate_remove, payment
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
 *    "date": 1557868521022, 
 *    "value": 123, 
 *    "from":"0x1234", 
 *    "to": "0x4321", 
 *    "fee": 0.1, 
 *    "type": "supplement", 
 *    "comment":"some text comment"
 * }]
 */
.get('/:net/address/:address', async (req, res) => {
    try{
        let address = (await Address.findOrCreate({
            where: {address: req.params.address},
            defaults: {
                address: req.params.address,
                net: req.params.net,
                currency: req.query.currency || req.params.net,
                updated: null,
                created: Date.now()
            },
            raw: true
        }))[0];

        let whereParams = {[sequelize.Op.or]: [{from: req.params.address}, {to: req.params.address}]};
        if(req.query.currency){
            whereParams.currency = req.query.currency;
        }
        if(req.query.date_from){
            whereParams.updated = {[sequelize.Op.gte]: req.query.date_from};
        }
        if(req.query.date_to){
            whereParams.updated = {[sequelize.Op.lte]: req.query.date_to};
        }
        let transactions = await Transaction.findAll({
            where: whereParams,
            offset: req.query.offset || null,
            limit: req.query.limit || null
        });
        address.transactions = transactions.map(tx => tx.dataValues);
        res.status(200).send(address);
    }
    catch(err){
        console.error(err);
        res.status(500).send({err: err.message, stack: err.stack});
    }
})

/**
 * @api {put} /net/:net/address/:address Set comment
 * @apiName setAddressComment
 * @apiGroup address
 * @apiDescription Set comment for address
 * 
 * @apiParam {String} comment     address comment
 * 
 * @apiSuccess {Boolean} success  completed successfully
 */
.put('/:net/address/:address/comment', (req, res) => {
    res.status(200).send({success: true});
})

/**
 * @api {delete} /net/:net/address/:address Remove address
 * @apiName removeAddress
 * @apiGroup address
 * @apiDescription Remove address and stop tracking
 * 
 * @apiSuccess {Boolean} success completed successfully
 */
.delete('/:net/address/:address', (req, res) => {
    res.status(200).send({success: true});
})
;

module.exports = router;
