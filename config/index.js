/**
 * @author cybor97
 */
const path = require('path');
const fs = require('fs');

const oldConfigFilename = path.join(__dirname, './creds.json');
const configFilename = path.join(__dirname, './config.json');

if(fs.existsSync(oldConfigFilename)){
    fs.renameSync(oldConfigFilename, configFilename);
}

if(!fs.existsSync(configFilename)){
    console.error("File config.json doesn't exist!")
    console.log('Should contain "host", "database", "username" and "password" keys.');
    process.kill(process.pid);
}

module.exports = Object.assign({
        //1m
        updateInterval: 60000,
        //1d
        bakingBadUpdateInterval: 86400000,
        //1h
        netInfoUpdateInterval: 3600000
    }, 
    JSON.parse(fs.readFileSync(configFilename))
);