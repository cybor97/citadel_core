const connectors = require('./connectors').getConnectors();

module.exports = {
  apps: [{
    name: 'API',
    script: 'app.js',
    args: '--api-server',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
  }, ...Object.keys(connectors).map((connectorName, i) => ({
    name: `#${i} Worker(${connectorName})`,
    script: 'app.js',
    args: ['--worker', `--net=${connectorName}`],
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
  }))],
};
