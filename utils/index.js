const jwt = require('jose');

module.exports = {
    preparePagination(query) {
        return {
            limit: query.limit ? parseInt(query.limit) : null,
            offset: query.offset ? parseInt(query.offset) : null
        }
    },

    checkToken(publicKey, token) {
        try {
            return jwt.JWT.verify(token, jwt.JWK.asKey(publicKey), { algorithms: ["PS256"] });
        } catch (err) {
            console.error('Authorization error', err);
            return false;
        }
    }
}