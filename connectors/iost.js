const ETHToken = require('./ethToken');

const TRANSFER_CONTRACT_HASH = '0xFA1a856Cfa3409CFa145Fa4e20Eb270dF3EB21ab';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const PRECENDING_ZEROES = '0'.repeat(24);

class IOST extends ETHToken {
    constructor(){
        super();
        this.apiUrl = 'https://api.etherscan.io/api';
    }

    async getAllTransactions(address, lastPaths){
        //ETH has a bit longer addresses with precending 0-es
        if(address.length === 42){
            address = address.replace('0x', `0x${PRECENDING_ZEROES}`);
        }

        let supplementFromBlock = null;
        for(let tx of lastPaths){
            if(tx.type === 'supplement' && tx.path){
                supplementFromBlock = JSON.parse(tx.path).blockNumber;
                break;
            }
        }

        return [].concat(
            await this.getTransferTransactions(address, 'topic1', supplementFromBlock),
            await this.getTransferTransactions(address, 'topic2', supplementFromBlock),
        );
    }

    async getTransferTransactions(address, topic, fromBlock = 0){
        return await this.getTransactionsForContractMethod(TRANSFER_CONTRACT_HASH, TRANSFER_TOPIC, 
            'supplement', address, topic, fromBlock);
    }
}

module.exports = IOST;