'use strict';
const config = require('../../config');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.sequelize.query(`
    UPDATE transactions 
    INNER JOIN addresses ON addresses.id = transactions.addressId 
    SET type = 'approved_payment'
    WHERE type = 'payment' AND addresses.net = 'orbs'`);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.resolve();
  }
};
