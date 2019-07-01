'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return await queryInterface.dropTable('votings');
  },

  down: (queryInterface, Sequelize) => {
    return Promise.resolve();
  }
};
