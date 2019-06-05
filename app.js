/**
 * @author cybor97
 */

const express = require('express');
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
  .use('/net', clientApi);

app.listen(8080);