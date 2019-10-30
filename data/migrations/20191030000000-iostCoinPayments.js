'use strict';
const config = require('../../config');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.sequelize.query(`
    UPDATE transactions 
    INNER JOIN addresses ON addresses.id = transactions.addressId 
    SET \`type\` = 'payment'
    WHERE \`type\` = 'supplement' AND addresses.net = 'iost-coin' AND \`from\` IN ('bonus.iost', 'vote_producer.iost')`);
  },

  down: (queryInterface, Sequelize) => {
    return Promise.resolve();
  }
};
