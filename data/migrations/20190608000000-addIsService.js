'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.bulkUpdate('addresses', { isService: 0 }, { isService: null });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('addresses', 'isService');
  }
};
