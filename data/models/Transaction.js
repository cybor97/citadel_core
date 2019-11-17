const sequelize = require('sequelize');
const connection = require('../index').getConnection();
const Address = require('./Address');
/**@type {sequelize.Model} */
const Transaction = connection.define('transactions', {
    id: {
        type: sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    addressId: {
        type: sequelize.INTEGER,
        references: {
            model: Address,
            key: 'id'
        }
    },
    //Additional data: original op. type and number for APIs with pagination and block number for blockchain RPC
    originalOpType: sequelize.TEXT,
    path: sequelize.TEXT,

    currency: {
        type: sequelize.STRING,
        allowNull: true
    },
    hash: sequelize.STRING,
    date: sequelize.BIGINT,
    value: sequelize.DOUBLE,

    feeBlockchain: {
        type: sequelize.DOUBLE,
        allowNull: true
    },
    gasUsed: {
        type: sequelize.DOUBLE,
        allowNull: true
    },
    ramUsed: {
        type: sequelize.DOUBLE,
        allowNull: true
    },

    from: sequelize.TEXT,
    fromAlias: sequelize.TEXT,
    to: sequelize.TEXT,
    fee: sequelize.DOUBLE,
    type: sequelize.STRING,
    comment: sequelize.TEXT,
    isCancelled: sequelize.BOOLEAN
}, { timestamps: false, alter: false });

Address.hasMany(Transaction);
Transaction.belongsTo(Address);

//TODO: Find out&remove
// Transaction.sync(true);

module.exports = Transaction;
