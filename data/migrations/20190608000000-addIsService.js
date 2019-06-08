'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('addresses', 'isService', Sequelize.BOOLEAN);
    return await queryInterface.bulkUpdate('addresses', {isService: 0}, {isService: null});
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('addresses', 'isService');
  }
};
