'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.addColumn('addresses', 'isExchange', { type: Sequelize.BOOLEAN, defaultValue: false });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('addresses', 'isService');
  }
};
