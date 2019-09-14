/**
 * @author cybor97
 */

const express = require('express');
require('./utils/expressAsyncErrors');

const path = require('path');
const clientApi = require('./routes/clientApi');

if (!process.argv.includes('--api-server')) {
  console.log('API Server mode, data collection disabled');
  const explorerUpdater = require('./workers/explorerUpdater');
  explorerUpdater.init();
}

if (!process.argv.includes('--worker')) {
  console.log('Worker mode, API disabled');

  const app = express();

  app
    .use(express.json())
    .use(express.urlencoded({ extended: true }))
    .use('/poc', express.static(path.join(__dirname, 'poc')))
    .use('/eztz.js/dist', express.static(path.join(__dirname, 'node_modules/eztz.js/dist')))
    .use('/doc', express.static(path.join(__dirname, 'doc')))
    .use('/net', clientApi)
    .use(async (err, req, res, next) => {
      console.error(err);
      res.status(500).send({
        message: err.message,
        stack: err.stack
      });
    });
  app.listen(8080);
}
