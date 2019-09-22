/**
 * @author cybor97
 */

const express = require('express');
const browserify = require('browserify-middleware');
const log = require('./utils/log');
require('./utils/expressAsyncErrors');

const path = require('path');
const clientApi = require('./routes/clientApi');

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
      res.status(500).send({
        message: err.message,
        stack: err.stack
      });
    });
  app.listen(8080);
}
