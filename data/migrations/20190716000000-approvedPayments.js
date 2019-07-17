'use strict';
const config = require('../../config');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.bulkUpdate('transactions', {type: 'approved_payment'}, {
      type: 'payment', 
      from: {
        [Sequelize.Op.in]: config.trustedAddresses
      }
    });
  },

  down: (queryInterface, Sequelize) => {
    return Promise.resolve();
  }
};
