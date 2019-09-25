'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.addColumn('transactions', 'isCancelled', { type: Sequelize.BOOLEAN, defaultValue: false });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('transactions', 'isCancelled');
  }
};
