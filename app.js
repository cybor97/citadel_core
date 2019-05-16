/**
 * @author cybor97
 */

const express = require('express');
const path = require('path');
const clientApi = require('./routes/clientApi');

const app = express();

app
  .use('/doc', express.static(path.join(__dirname, 'doc')))
  .use('/net', clientApi);

app.listen(8080);