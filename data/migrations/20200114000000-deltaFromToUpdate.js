'use strict';
const config = require('../../config');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.sequelize.query('UPDATE transactions SET "deltaFrom" = -transactions.value, "deltaTo" = transactions.value WHERE currency = \'tez\' AND "deltaFrom" IS NULL;');
  },

  down: async (queryInterface, Sequelize) => {
    return await Promise.resolve();
  }
};
