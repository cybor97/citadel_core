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

    hash: sequelize.STRING,
    date: sequelize.BIGINT,
    value: sequelize.DOUBLE,
    from: sequelize.STRING,
    fromAlias: sequelize.STRING,
    to: sequelize.STRING,
    fee: sequelize.DOUBLE,
    type: sequelize.STRING,
    comment: sequelize.TEXT,
    isCancelled: sequelize.BOOLEAN
}, { timestamps: false });

Address.hasMany(Transaction);
Transaction.belongsTo(Address);

module.exports = Transaction;
