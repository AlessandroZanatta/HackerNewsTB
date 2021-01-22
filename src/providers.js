var request = require('then-request');
const Enum = require('enum');
const fs = require('fs');
const random = require('random');
let Parser = require('rss-parser');
var escape = require('markdown-escape')

// The directory containing the news
const NEWS_DIR = 'news_data';

// Create the directory if it does not exist
if (!fs.existsSync(NEWS_DIR)){
    fs.mkdirSync(NEWS_DIR);
}

// RSS parser
const PARSER = new Parser();

/* -------------------------------------------------------------------------------- */
/* ----------------------------------- Provider ----------------------------------- */
/* -------------------------------------------------------------------------------- */

// Base class for the various news provider to extend

class Provider {

    constructor(providerName){
        this.providerName = providerName;
        this.providerDir = `${NEWS_DIR}/${this.providerName}`;
        this.blacklistFile = `${this.providerDir}/blacklist.json`;

        // Create directory of the provider, if it doesn't exists
        if (!fs.existsSync(this.providerDir)){
            fs.mkdirSync(this.providerDir);
        }

        this.cleanBlacklist();
    }

    getProviderName(){
        return this.providerName;
    }

    /**
     * Defines a method for updating the list of news.
     */
    updateNews(){};

    /** 
     * Pulls a new news of the requested type and passes it to the given callback
     * 
     * @param callback a function that requires a single argument, which is the message to send to the user
     */
    getNews(callback){};


    /**
     * Cleans the blacklist, removing everything to avoid consuming too much space.
     */
    cleanBlacklist(){
        console.log(`[${this.getProviderName()}] Cleaning blacklist...`);
        fs.writeFile(this.blacklistFile, JSON.stringify([]), 'utf8', err => {
            if(err) {
                console.log(`    ${err}`);
            }
        });
        console.log('    Done!')
    }


    /**
     * Returns the blacklist to the callback
     */
    getBlacklist(callback){
        fs.readFile(this.blacklistFile, 'utf8', (err, data) => {
            if(err){
                console.log(`    ${err}`)
            } else {
                callback(JSON.parse(data));
            }
        });
    }

    /**
     * News that have already been sent to the user should not be sent again.
     * This function allows blacklisting of such news.
     * 
     * @param identifiers a list of object to blacklist
     */
    addToBlacklist(currentBlacklist, identifiers){
        currentBlacklist = currentBlacklist.concat(identifiers);
        fs.writeFile(this.blacklistFile, JSON.stringify(currentBlacklist), err => {
            if(err){
                console.log(err);
            }
        });
    }
}

/* -------------------------------------------------------------------------------- */
/* ---------------------------------- HackerNews ---------------------------------- */
/* -------------------------------------------------------------------------------- */

class HackerNewsProvider extends Provider {

    constructor(){
        super('HackerNews');
        this.new = 'newstories.json';
    }

    // Retrieve news ids from the HackerNews API
    updateNews(){

        console.log(`[${this.getProviderName()}] Gettings news...`)
    
        const url = `https://hacker-news.firebaseio.com/v0/${this.new}`
        
        console.log(`    Got ${url}`);
        
        request('GET', url).done(res => {
            const data = res.getBody();
            const filename = `${this.providerDir}/${this.new}`;
            fs.writeFile(filename, data, 'utf8', err => {
                if(err){
                    console.error('    ' + err);
                }
            })
        });

        console.log('    Done!');
    }

    getNews(callback){
        const filePath = `${this.providerDir}/${this.new}`;
        fs.readFile(filePath, (err, data) => {
            let ids = JSON.parse(data);

            this.getBlacklist(blacklist => {
                let notInBlacklist = ids.filter(x => !blacklist.includes(x));

                if(notInBlacklist.length === 0){
                    callback(null);
                }
                
                let chosenID = notInBlacklist[0];
                this.getNewsData(chosenID, callback);
                this.addToBlacklist(blacklist, chosenID);
            });
        });
    }

    getNewsData(id, callback){
        
        const url = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;    
        request('GET', url).done(res => {
            let news = JSON.parse(res.getBody());
            callback({
                'provider': this.getProviderName(), 
                'news': {
                    'title': news.title,
                    'link': news.url
                }
            });
        });
    }
}

/* -------------------------------------------------------------------------------- */
/* ---------------------------------- PORTSWIGGER --------------------------------- */
/* -------------------------------------------------------------------------------- */

/**
 * A class to manage all RSS providers at once
 */
class RSSProvider extends Provider {
    
    /**
     * @param {string} providerName a pretty name for logging and user interaction
     * @param {string} rssUrl the url where the rss feed can be downloaded from
     */
    constructor(providerName, rssUrl){
        super(providerName);

        this.rssUrl = rssUrl;
        this.rssFile = `${this.providerDir}/rss.xml`;
    }

    updateNews(){

        console.log(`[${this.getProviderName()}] Starting update...`);
        
        // Latest Hacking News do not seem to like bots downloading their feed...
        request('GET', this.rssUrl, {'headers': {'User-Agent':'Mozilla/5.0 (X11; Linux x86_64; rv:84.0) Gecko/20100101 Firefox/84.0'}}).done(res => {
            const data = res.getBody();
            fs.writeFile(this.rssFile, data, 'utf8', err => {
                if(err){
                    console.log('    ' + err);
                }
            })
        });

        console.log('    Done!')
    };

    getNews(callbackFound, callbackNotFound){

        console.log(`[${this.getProviderName()}] Getting news...`)

        fs.readFile(this.rssFile, 'utf8', (err, data) => {
            if(err){
                console.log('    ' + err);
            } else {
                // Async parse of RSS file
                (async (data) => {
                    let feed = await PARSER.parseString(data);
                    let couples = [];
                    feed.items.forEach(item => {
                        let title = item.title;
                        let link = item.link;
                        couples.push({'title': title, 'link': link});
                    });
                    
                    // With blacklist, check for already visited links
                    this.getBlacklist(blacklist => {
                        let notInBlacklist = couples.filter(x => !blacklist.includes(x.link));

                        if(notInBlacklist.length === 0){
                            callbackNotFound(null); // if there are no news, return null
                            return;
                        }
                        
                        // otherwise return the first news

                        const item = notInBlacklist[0];
                        
                        this.addToBlacklist(blacklist, [item.link]);
                        
                        callbackFound({
                            'provider': this.getProviderName(), 
                            'news': {
                                'title': item.title,
                                'link': item.link
                            }
                        });
                    })
                })(data);
            }
        });

        console.log('    Done!');
    };
}


function getNewsWrapper(provider){
    return new Promise((resolve, reject) => {
        provider.getNews((successResponse) => {
            resolve(successResponse);
        }, (errorResponse) => {
            reject(errorResponse)
        });
    });
}

/* -------------------------------------------------------------------------------- */
/* ------------------------------------ EXPORTS ----------------------------------- */
/* -------------------------------------------------------------------------------- */

module.exports.HackerNewsProvider = HackerNewsProvider;
module.exports.RSSProvider = RSSProvider;
module.exports.getNewsWrapper = getNewsWrapper;