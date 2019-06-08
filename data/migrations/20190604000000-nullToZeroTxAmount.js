'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.bulkUpdate('transactions', {value: 0}, {value: null});
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.bulkUpdate('transactions', {value: 0}, {value: 0});
  }
};
