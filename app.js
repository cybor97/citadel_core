/**
 * @author cybor97
 */

const express = require('express');
require('./utils/expressAsyncErrors');

const path = require('path');
const bodyparser = require('body-parser');
const clientApi = require('./routes/clientApi');
const explorerUpdater = require('./workers/explorerUpdater');
explorerUpdater.init();

const app = express();

app
  .use(bodyparser.json())
  .use(bodyparser.urlencoded({
    extended: true
  }))
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