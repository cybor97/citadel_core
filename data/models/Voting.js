const sequelize = require('sequelize');
const connection = require('../index').getConnection();

const Voting = connection.define('voting', {
        id: {
            type: sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
        },
        originalId: sequelize.STRING,
        net: {
            type: sequelize.STRING,
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true
            }
        },
        title: sequelize.STRING,
        start_datetime: sequelize.BIGINT,
        end_datetime: sequelize.BIGINT,
        answers: sequelize.JSON
    }, { 
       timestamps: false,
    });
Voting.sync();

module.exports = Voting;
