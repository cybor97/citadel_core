const axios = require('axios');
const config = require('../config');

const MESSARI_URL = 'https://data.messari.io/api/v1';

class Messari {
    static async getInfo(currency) {
        let data = (await axios.get(`${MESSARI_URL}/assets/${currency}/metrics`)).data.data;

        return {
            priceUsd: data.market_data.price_usd,
            priceBtc: data.market_data.price_btc,
            priceUsdDelta24: data.market_data.percent_change_usd_last_24_hours,
            priceBtcDelta24: data.market_data.percent_change_btc_last_24_hours,
            yield: 0,
            //TODO: Review in 2049(December)
            marketCap: ~~data.supply.y_2050,
            circulatingSupply: data.supply.circulating,
            stakingRate: '-',
            unbondingPeriod: 0
        };
    }
}

module.exports = Messari;