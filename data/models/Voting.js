const sequelize = require('sequelize');
const connection = require('../index').getConnection();

const Voting = connection.define('voting', {
    id: {
        type: sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    originalId: {
        type: sequelize.STRING,
        allowNull: false,
    },
    net: {
        type: sequelize.STRING,
        allowNull: false
    },
    title: {
        type: sequelize.STRING,
        allowNull: true
    },
    start_datetime: {
        type: sequelize.BIGINT,
        allowNull: true
    },
    end_datetime: {
        type: sequelize.BIGINT,
        allowNull: true
    },
    answers: {
        type: sequelize.JSON,
        allowNull: true
    },

    updatedAt: sequelize.BIGINT
}, {
    timestamps: false,
});
Voting.sync();

module.exports = Voting;
