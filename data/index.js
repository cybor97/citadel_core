/**
 * @author cybor97
 */
const Sequelize = require('sequelize');
const config = require('../config');

class DBConnection {
    static getConnection() {
        if (!this.connection) {
            this.connection = new Sequelize({
                dialect: config.dialect,
                host: config.host,
                database: config.database,
                username: config.username,
                password: config.password,
                logging: (process.argv.indexOf('-v') != -1) ? console.log : null,
                pool: {
                    max: 5,
                    min: 0,
                    acquire: 30000,
                    idle: 10000
                }
            });
        }

        return this.connection;
    }
}

module.exports = DBConnection;