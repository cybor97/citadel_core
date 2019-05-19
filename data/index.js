/**
 * @author cybor97
 */

class DBConnection {
    static connection = null;

    static getConnection(){
        if(this.connection){
            return this.connection;
        }
        
        this.connection = new Sequelize({
            dialect: 'mysql',
            operatorsAliases: false,
            host: config.chatDB.host,
            database: config.chatDB.name,
            username: config.chatDB.username,
            password: config.chatDB.password,
            logging: (process.argv.indexOf('-v') != -1) ? console.log : null
        });    
    }
}