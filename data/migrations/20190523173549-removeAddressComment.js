'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('addresses', 'comment');
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.addColumn('addresses', 'comment', Sequelize.STRING);
  }
};
