const axios = require('axios');
const BaseConnector = require('./baseConnector');

class IOSTCoin extends BaseConnector {
    constructor() {
        super();
        this.apiUrl = 'https://www.iostabc.com/api';
        this.apiUrlAdditional = `https://api.iostabc.com/api/?apikey=6cfb2325fd0d6ccbd2e61d5793769eb0`;
    }


    async getDelegationBalanceInfo(address) {
        let ramgasOperations = await axios.get(`${this.apiUrl}/account/${address}/actions?type=ramgas`);
        ramgasOperations = ramgasOperations.data.actions;
        let pledgedTotal = ramgasOperations
            .filter(c => c.action_name === 'pledge')
            .reduce((prev, next) => prev + parseFloat(JSON.parse(next.data)[2]), 0);

        let delegatedData = await axios.get(`${this.apiUrl}/voters/${address}`);
        delegatedData = delegatedData.data;
        let delegation = delegatedData.voters.find(c => c.account === address);
        let delegatedTotal = parseInt(delegation.votes);

        let createdAccounts = await axios.get(`${this.apiUrl}/account/paradigm_cd/created`);
        createdAccounts = createdAccounts.data.accounts;

        let availableBalanceData = await axios.get(`${this.apiUrlAdditional}&module=account&action=get-account-balance&account=${address}`);
        availableBalanceData = availableBalanceData.data.data;

        return {
            //TODO: Use available balance
            mainBalance: delegatedTotal + pledgedTotal + parseFloat(availableBalanceData.balance),
            delegatedBalance: delegatedTotal,
            originatedAddresses: createdAccounts
        }
    }
}

module.exports = IOSTCoin;