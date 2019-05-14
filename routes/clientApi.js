/**
 * @author cybor97
 */

const { Router } = require('express');
const router = Router();

router
/**
 * @api {get} /address Get all tracked addresses
 * @apiName getAddresses
 * @apiGroup address
 * 
 * @apiParam {Number} limit
 * @apiParam {Number} offset
 * 
 * @apiSuccess {Array} result [{"address": "0x1234", "lastUpdate": 1557868521022}]
 */
.get('/address', (req, res) => {

}) 

/**
 * @api {get} /address/:address Get specific address data
 * @apiName getAddress
 * @apiGroup address
 * 
 * @apiParam {String} currency  currency
 * @apiParam {Number} from      transactions from(timestamp)
 * @apiParam {Number} to        transactions to(timestamp)
 * 
 * @apiSuccess {String} address
 * @apiSuccess {String} currency
 * @apiSuccess {Array} transactions [{"type": 1, "data": [{"date": 1557868521022, "value": 123, "from":"0x1234", "to": "0x4321", "fee": 0.1}]}]
 * 
 * @apiParam {String} address
 */
.get('/address/:address', (req, res) => {

})

/**
 * @api {delete} /address/:address Remove address
 * @apiName removeAddress
 * @apiGroup address
 * 
 * @apiSuccess {Boolean} success
 * 
 * @apiParam {String} address
 */
.delete('/address/:address', (req, res) => {

});

module.exports = router;
