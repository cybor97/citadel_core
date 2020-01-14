'use strict';
const config = require('../../config');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await Promise.all([
      queryInterface.sequelize.query('ALTER TABLE transactions ADD COLUMN `deltaFrom` FLOAT;'),
      queryInterface.sequelize.query('ALTER TABLE transactions ADD COLUMN `deltaTo` FLOAT;')
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return await Promise.all([
      queryInterface.sequelize.query('ALTER TABLE transactions DROP COLUMN `deltaFrom`;'),
      queryInterface.sequelize.query('ALTER TABLE transactions DROP COLUMN `deltaTo`;')
    ]);
  }
};
