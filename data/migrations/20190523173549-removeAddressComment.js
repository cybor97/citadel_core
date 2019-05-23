'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    console.log(queryInterface)
    return queryInterface.removeColumn('addresses', 'comment');
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.addColumn('addresses', 'comment', Sequelize.STRING);
  }
};
