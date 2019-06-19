const axios = require('axios');
const config = require('../config');

const COIN_MARKET_CAP_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';
const BITTREX_URL = 'https://api.bittrex.com/api/v1.1/public/getmarketsummary';

class Bittrex {
    static async getInfo(coinMarketCapSymbol, bittrexMarket){
        let quote = (await axios.get(COIN_MARKET_CAP_URL, {
            params: {
                symbol: coinMarketCapSymbol
            },
            headers: {'X-CMC_PRO_API_KEY': config.coinMarketCap.apikey}
        })).data.data[coinMarketCapSymbol];

        let circulatingSupply = quote.circulating_supply;
        let marketCap = quote.quote.USD.market_cap;
        let priceUsd = quote.quote.USD.price;
        let priceUsdDelta24 = priceUsd * quote.quote.USD.percent_change_24h * 0.01;

        let bittrexData = (await axios.get(BITTREX_URL, {
            params:{
                market: bittrexMarket
            }
        })).data.result[0];
        let priceBtc = bittrexData.Last;
        let priceBtcDelta24 = priceBtc - bittrexData.PrevDay;
        return {        
            priceUsd: priceUsd,
            priceBtc: priceBtc,
            priceUsdDelta24: priceUsdDelta24,
            priceBtcDelta24: priceBtcDelta24,
            yield: 0,
            marketCap: marketCap,
            circulatingSupply: circulatingSupply,
            stakingRate: 0,
            unbondingPeriod: 0
        };
    }
}

module.exports = Bittrex;