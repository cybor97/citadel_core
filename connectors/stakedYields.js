const axios = require('axios');
const cheerio = require('cheerio');

const STAKED_YIELDS_URL = 'https://staked.us/yields/';

class StakedYields {
    static async getInfo(net) {
        let data = await axios.get(STAKED_YIELDS_URL);
        data = data.data;
        let dom = cheerio.load(data);
        return dom('table tr')
            .get()
            .map(c => dom(c)
                .children('td.FT__cell--name, td[data-title="Yield"], td[data-title="% Staked"], td[data-title="Lock-Up"]')
                .get()
                .map(item => dom(item).text().replace(/  /g, '').trim().split('\n').pop())
            )
            .reduce((prev, next) => {
                prev[next[0]] = { yield: next[1], stakingRate: next[2], unbondingPeriod: next[3] };
                return prev;
            }, {})[net];
    }
}

module.exports = StakedYields;