'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn('addresses', 'comment', Sequelize.STRING);
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.deleteColumn('addresses', 'comment');
  }
};
