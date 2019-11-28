[![CircleCI](https://circleci.com/gh/cybor97/citadel_core/tree/master.svg?style=svg)](https://circleci.com/gh/cybor97/citadel_core/tree/master)

# Paradigm Citadel Core

Paradigm Citadel blockchain interaction backend

# Build

1. `git clone https://github.com/cybor97/citadel_core`
2. `sudo npm i -g pm2` (unrequired for debugging)
3. `npm i`
4. Configure according to "Before run" section
5. `pm2 start` or
6. `node app` (to debug, optional `--worker` or `--api-server` arg can be passed, for `--worker` param `--net=CONNECTOR_NAME` can be specified)

# Before run

Create user and db in postgres:
- `sudo -u postgres psql`
- `createuser --interactive --pwprompt`
- Fill required data
- `createdb -O USER_NAME DB_NAME` where USER_NAME - username, created at previous step and DB_NAME - desired database name

Create config.json according to configTemplate.json and specify required params.

These params are optional:
* "app" section can be skipped, :8080 will be used by default
* faucetAddress&faucetPrivateKey should be specified only if you're going to provide service to create new addresses for IOST network
* coinMarketCap apikey is required for getting info about networks

For "user" section and registering addresses `authorized.pub` file should exist in config directory. `authorized.pub` - public key for JWT, algo PS256, key RSA, length 2048.

# API Documentation

http://api.paradigmcitadel.io:8081/doc
