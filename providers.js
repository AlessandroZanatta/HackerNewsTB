
var request = require('then-request');
const Enum = require('enum');
const fs = require('fs');

const NEWS_DIR = 'news_data';

/* -------------------------------------------------------------------------------- */
/* ----------------------------------- Provider ----------------------------------- */
/* -------------------------------------------------------------------------------- */

// Base class for the various news provider to extend

class Provider {
    /**
     * Defines a method for updating the list of news.
     */
    updateNews(){};

    /**
     * Get the url of a news through an identifier.
     */
    getNewsUrl(identifier){};

    /**
     * News that have already been sent to the user should not be sent again.
     * This function allows blacklisting of such news.
     */
    blacklistNews(){};
}

/* -------------------------------------------------------------------------------- */
/* ---------------------------------- HackerNews ---------------------------------- */
/* -------------------------------------------------------------------------------- */

class HackerNewsProvider extends Provider {

    constructor(){
        super();
        this.providerName = 'HackerNews';
    }

    // Retrieve news ids from the HackerNews API
    updateNews(){
        const HN_DIR = 'hackernews'
    
        // HackerNews valid API endpoints for getting news/story/ask ids
        const hackerNewsEndpoints = [
            'topstories',
            'beststories',
            'newstories',
            // 'askstories',
            // 'showstories',
            // 'jobstories'
        ];
    
        console.log(`[-] Starting update of ${HN_DIR} ...`)
    
        hackerNewsEndpoints.forEach(endpoint => {
    
            const url = `https://hacker-news.firebaseio.com/v0/${endpoint}.json`
            
            console.log(`   Got ${url}`);
            
            request('GET', url).done(res => {
                const data = res.getBody();
                const filename = `${NEWS_DIR}/${HN_DIR}/${endpoint}.json`;
                fs.writeFile(filename, data, 'ascii', err => {
                    if(err){
                        console.log(err);
                    } else {
                        console.log(`Saved "${endpoint}" ids to ${filename}`);
                    }
                })
            });
        });
    }
    
    getNewsUrl(id, callback){
    
        const url = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
    
        console.log(`[+] Getting ${url}`)
    
        request('GET', url).done(res => {
            callback(JSON.parse(res.getBody()).url);
        });
    }

    blacklistNews(){
        //TODO
    }
}

/* -------------------------------------------------------------------------------- */
/* ------------------------------------ EXPORTS ----------------------------------- */
/* -------------------------------------------------------------------------------- */

module.exports.HackerNewsProvider = HackerNewsProvider;
module.exports.Provider = Provider;
