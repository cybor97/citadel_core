const sequelize = require('sequelize');
const connection = require('../index').getConnection();

const NetInfo = connection.define('netInfo', {
    id: {
        type: sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    net: {
        type: sequelize.STRING,
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: true
        }
    },
    priceUsd: sequelize.FLOAT,
    priceBtc: sequelize.FLOAT,
    priceUsdDelta24: sequelize.FLOAT,
    priceBtcDelta24: sequelize.FLOAT,
    yield: sequelize.FLOAT,
    marketCap: sequelize.FLOAT,
    circulatingSupply: sequelize.FLOAT,
    stakingRate: sequelize.STRING,
    unbondingPeriod: sequelize.STRING,

    updatedAt: sequelize.BIGINT
}, {
    timestamps: false,
});
NetInfo.sync();

module.exports = NetInfo;
