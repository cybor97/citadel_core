module.exports = {
    preparePagination(query){
        return {
            limit: query.limit ? parseInt(query.limit) : null,
            offset: query.offset ? parseInt(query.offset) : null    
        }
    }
}