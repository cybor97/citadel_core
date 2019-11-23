const sequelize = require('sequelize');
const connection = require('../index').getConnection();

const Address = connection.define('address', {
    id: {
        type: sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    userIds: {
        type: sequelize.TEXT,
        allowNull: true
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
    isService: {
        type: sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    created: {
        type: sequelize.BIGINT,
        allowNull: false
    },
    updated: {
        type: sequelize.BIGINT,
        defaultValue: null
    },
    isExchange: {
        type: sequelize.BOOLEAN,
        defaultValue: false
    }
}, {
    timestamps: false,
    alter: true
});

module.exports = Address;
