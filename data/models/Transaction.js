const sequelize = require('sequelize');

const Transaction = citadelCoreDB.define('transactions', {
    id: {
        type: sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    type: {
        type: sequelize.INTEGER,
        allowNull: false
    }
}, { timestamps: false });
Transaction.sync();

module.exports = Transaction;
