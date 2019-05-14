const sequelize = require('sequelize');

const TransactionData = citadelCoreDB.define('transactionData', {
    id: {
        type: sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    date: {
        type: sequelize.INTEGER,
        allowNull: false,
    },
    value: {
        type: sequelize.INTEGER,
        allowNull: false,
    },
    from: {
        type: sequelize.STRING,
        //For "balance" transaction
        allowNull: true
    },
    to: {
        type: sequelize.STRING,
        allowNull: false
    },
    fee: sequelize.FLOAT
}, { timestamps: false });
TransactionData.sync();

module.exports = TransactionData;
