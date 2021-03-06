/**
 * @author cybor97
 */
const fs = require('fs');
const express = require('express');
const browserify = require('browserify-middleware');
const path = require('path');

const log = require('./utils/log');
const config = require('./config');
require('./utils/expressAsyncErrors');

const clientApi = require('./routes/clientApi');
const { ValidationError } = require('./utils/errors');

Promise.resolve()
  .then(() => Promise.all(fs
    .readdirSync(path.join(__dirname, 'data/models'))
    .map(model => require(`./data/models/${model}`).sync(true))
  ))
  .then(() => {
    if (!process.argv.includes('--api-server')) {
      if (process.argv.includes('--worker')) {
        log.info('Worker mode, API disabled');
      }
      const explorerUpdater = require('./workers/explorerUpdater');
      explorerUpdater.init();
    }

    if (!process.argv.includes('--worker')) {
      if (process.argv.includes('--api-server')) {
        log.info('API Server mode, data collection disabled');
      }

      const app = express();

      app
        .use(express.json())
        .use(express.urlencoded({ extended: true }))
        .use('/eztz.js/dist', express.static(path.join(__dirname, 'node_modules/eztz.js/dist')))
        .use('/iost/dist', express.static(path.join(__dirname, 'node_modules/iost/dist/iost.node.js')))
        .use('/doc', express.static(path.join(__dirname, 'doc')))
        .use('/poc', express.static(path.join(__dirname, 'poc')))
        .use('/poc/poc.bundle.js', browserify(path.join(__dirname, 'poc/poc.js')))
        .use('/net', clientApi)
        .use(async (err, req, res, next) => {
          log.err(err);
          if (err instanceof ValidationError) {
            return res.status(400).send({ message: err.message });
          }

          return res.status(500).send({
            message: err.message,
            stack: err.stack
          });
        })
        .use((req, res, next) => {
          return res.status(404).send({ message: 'Method not found' });
        });
      app.listen(config && config.app && config.app.port || 8080);
    }
  });