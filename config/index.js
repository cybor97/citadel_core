/**
 * @author cybor97
 */
const path = require('path');
const fs = require('fs');

const credsFilename = path.join(__dirname, './creds.json');

if(!fs.existsSync(credsFilename)){
    console.error("File creds.json doesn't exist!")
    console.log('Should contain "dbHost", "dbName", "dbUsername" and "dbPassword" keys.');
    process.kill(process.pid);
}

module.exports = Object.assign({
        updateInterval: 60000
    }, 
    JSON.parse(fs.readFileSync(credsFilename))
);