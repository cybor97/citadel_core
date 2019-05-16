const sequelize = require('sequelize');

const Address = citadelCoreDB.define('address', {
    id: {
        type: sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    address: {
        type: sequelize.STRING,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    net: {
        type: sequelize.STRING,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    currency: {
        type: sequelize.STRING,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    lastUpdate: {
        type: sequelize.INTEGER,
        allowNull: true,
        defaultValue: null
    }
}, { 
    timestamps: true,
    createdAt: 'created',
    updatedAt: 'udpated'
 });
Address.sync();

module.exports = Address;
