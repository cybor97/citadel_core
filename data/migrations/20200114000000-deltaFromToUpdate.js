'use strict';
const config = require('../../config');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.sequelize.query('UPDATE transactions SET `deltaFrom` = -transactions.value, `deltaTo` = transactions.value;');
  },

  down: async (queryInterface, Sequelize) => {
    return await Promise.resolve();
  }
};
