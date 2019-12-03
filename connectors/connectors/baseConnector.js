class BaseConnector {
    getAllTransactions() {

    }

    async sendZabbix(data) {
        if (this.zabbixSender) {
            if (this.zabbixSender.clearItems) {
                this.zabbixSender.clearItems();
            }
            Object.keys(data).forEach(key => this.zabbixSender.addItem(`connector.${key}`, data[key]));
            await new Promise((resolve, reject) => this.zabbixSender.send((err, res) => {
                if (err) {
                    return reject(err);
                }
                else {
                    return resolve(res);
                }
            }));
        }
    }
}

module.exports = BaseConnector;