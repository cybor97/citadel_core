const sequelize = require('sequelize');

const Transaction = citadelCoreDB.define('transactions', {
    id: {
        type: sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    hash: sequelize.STRING,
    addressId: {
        type: sequelize.INTEGER,
        references: {
            model: Address,
            key: 'id'
        }
    },
    date: sequelize.INTEGER,
    value: sequelize.DOUBLE,
    from: sequelize.STRING,
    to: sequelize.STRING,
    fee: sequelize.DOUBLE,
    type: sequelize.STRING,
    comment: sequelize.STRING
}, { timestamps: false });
Transaction.sync();

module.exports = Transaction;
