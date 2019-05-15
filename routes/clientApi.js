/**
 * @author cybor97
 */

const { Router } = require('express');
const router = Router();

router
/**
 * @api {get} /net Get all tracked networks
 * @apiName getAddresses
 * @apiGroup net
 * @apiDescription Get all tracked networks
 * 
 * @apiParam {Number} [limit]
 * @apiParam {Number} [offset]
 * 
 * @apiSuccess {Array} result [{"address": "0x1234", "lastUpdate": 1557868521022}]
 */
.get('/net', (req, res) => {

})

/**
 * @api {delete} /net/:net Remove all
 * @apiName removeAll
 * @apiGroup net
 * @apiDescription Remove all addresses and from specified network
 * 
 * @apiSuccess {Boolean} success
 */
.delete('/net/:net', (req, res) => {

})

/**
 * @api {get} /net/:net/address Get all tracked addresses
 * @apiName getAddresses
 * @apiGroup address
 * @apiDescription Get all tracked addresses for specific network
 * 
 * @apiParam {Number} [limit]
 * @apiParam {Number} [offset]
 * 
 * @apiSuccess {Array} result [{"address": "0x1234", "lastUpdate": 1557868521022}]
 */
.get('/net/:net/address', (req, res) => {

}) 

/**
 * @api {get} /net/:net/address/:address Get specific address data
 * @apiName getAddress
 * @apiGroup address
 * @apiDescription Get specific address data with optional pagination, currency filter and dates.
 * If not exists - updated and created will be null
 * Address data type: supplement, conclusion, delegation, delegate_change, delegate_remove, payment
 * 
 * @apiParam {String} [currency]     currency
 * @apiParam {Number} [date_from]    transactions from(timestamp)
 * @apiParam {Number} [date_to]      transactions to(timestamp)
 * @apiParam {Number} [limit]
 * @apiParam {Number} [offset]
 * 
 * @apiSuccess {String} address
 * @apiSuccess {String} net
 * @apiSuccess {String} currency
 * @apiSuccess {Number} updated
 * @apiSuccess {Number} created
 * @apiSuccess {Array} transactions [{"type": 1, "data": [{"date": 1557868521022, "value": 123, "from":"0x1234", "to": "0x4321", "fee": 0.1, "type": "supplement", "comment":"some text comment"}]}]
 */
.get('/net/:net/address/:address', (req, res) => {

})

/**
 * @api {put} /net/:net/address/:address Set comment
 * @apiName setAddressComment
 * @apiGroup address
 * @apiDescription Set comment for address
 * 
 * @apiParam {String} comment     
 * 
 * @apiSuccess {Boolean} success
 */
.put('/net/:net/address/:address/comment', (req, res) => {

})

/**
 * @api {delete} /net/:net/address/:address Remove address
 * @apiName removeAddress
 * @apiGroup address
 * @apiDescription Remove address and stop tracking
 * 
 * @apiSuccess {Boolean} success
 */
.delete('/net/:net/address/:address', (req, res) => {

})
;

module.exports = router;
