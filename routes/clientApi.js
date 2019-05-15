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
 * @apiParam {Number} [limit]  limit to specific count
 * @apiParam {Number} [offset] start from position
 * 
 * @apiSuccess {Array} result [{"address": "0x1234", "lastUpdate": 1557868521022}]
 */
.get('/net', (req, res) => {

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
 * Address data type: 
 * * supplement, conclusion, delegation, delegate_change, delegate_remove, payment
 * 
 * @apiParam {String} [currency]     currency
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
.get('/net/:net/address/:address', (req, res) => {

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
.put('/net/:net/address/:address/comment', (req, res) => {

})

/**
 * @api {delete} /net/:net/address/:address Remove address
 * @apiName removeAddress
 * @apiGroup address
 * @apiDescription Remove address and stop tracking
 * 
 * @apiSuccess {Boolean} success completed successfully
 */
.delete('/net/:net/address/:address', (req, res) => {

})
;

module.exports = router;
