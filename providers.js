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

// Type of news
const NEWS_TYPES = new Enum(['new', 'top', 'best'], { ignoreCase: true })

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
        fs.readFile(this.blacklistFile, (err, data) => {
            callback(JSON.parse(data));
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
        this.top = 'topstories.json';
        this.best = 'beststories.json';

        this.news_types = new Enum({
            'new': this.new, 
            'best': this.best, 
            'top': this.top
        });
    }

    // Retrieve news ids from the HackerNews API
    updateNews(){
    
        // HackerNews valid API endpoints for getting news/story/ask ids
        const hackerNewsEndpoints = [
            this.new,
            this.top,
            this.best
            // 'askstories',
            // 'showstories',
            // 'jobstories'
        ];
        
        console.log(`[${this.getProviderName()}] Starting update...`)
    
        hackerNewsEndpoints.forEach(endpoint => {
    
            const url = `https://hacker-news.firebaseio.com/v0/${endpoint}`
            
            console.log(`    Got ${url}`);
            
            request('GET', url).done(res => {
                const data = res.getBody();
                const filename = `${this.providerDir}/${endpoint}`;
                fs.writeFile(filename, data, 'ascii', err => {
                    if(err){
                        console.log('    ' + err);
                    }
                })
            });
        });
    }

    getNews(type, callback){
        if(!this.news_types.isDefined(type.key)){
            callback(`This type of news is not available for ${this.getProviderName()} provider!`);
            return;
        }

        console.log(`[${this.getProviderName()}] Searching for a '${type.key}' news...`)

        // Chose a news from the correct file of ids
        let idsFromFile = this.news_types.get(type.key).value;

        const filePath = `${this.providerDir}/${idsFromFile}`;
        fs.readFile(filePath, (err, data) => {
            let ids = JSON.parse(data);

            this.getBlacklist(blacklist => {
                let notInBlacklist = ids.filter(x => !blacklist.includes(x));
                let chosenID = notInBlacklist[random.int(0, notInBlacklist.length-1)];
                this.getNewsUrl(chosenID, callback);
                this.addToBlacklist(blacklist, chosenID);
            });
        });
    }

    getNewsUrl(id, callback){
        
        const url = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;    
        request('GET', url).done(res => {
            let url = JSON.parse(res.getBody()).url;

            console.log(`[${this.getProviderName()}] Returning: ${url}`);
            callback(url);
        });
    }

}

/* -------------------------------------------------------------------------------- */
/* ---------------------------------- PORTSWIGGER --------------------------------- */
/* -------------------------------------------------------------------------------- */

class PortSwiggerProvider extends Provider {

    constructor(){
        super('Daily Swig');

        this.rssUrl = 'https://portswigger.net/daily-swig/rss';
        this.rssFile = `${this.providerDir}/rss.xml`;
    }

    updateNews(){

        console.log(`[${this.getProviderName()}] Starting update...`);
        
        request('GET', this.rssUrl).done(res => {
            const data = res.getBody();
            fs.writeFile(this.rssFile, data, 'utf8', err => {
                if(err){
                    console.log('    ' + err);
                }
            })
        });

        console.log('    Done!')
    };

    getNews(callback){

        console.log(`[${this.getProviderName()}] Getting news...`)

        fs.readFile(this.rssFile, 'utf8', (err, data) => {
        if(err){
            console.log('    ' + err);
        } else{
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

                    if(notInBlacklist.length == 0){
                        callback('You\'ve read all the news! Check back tomorrow!');
                        return;
                    }
                    
                    const ITEMS_PER_MESSAGE = 5;
                    
                    let msg = `Here's ${ITEMS_PER_MESSAGE} news from Daily Swig:\n\n\n`;
                    let toAddToBlack = [];
                    
                    for(let i = 0; i < Math.min(ITEMS_PER_MESSAGE, notInBlacklist.length); i++){
                        let item = notInBlacklist[i];
                        toAddToBlack.push(item.link);
                        msg += `[${markdownEscape(item.title)}](${markdownEscape(item.link)})\n\n`;
                    }
                    
                    this.addToBlacklist(blacklist, toAddToBlack);
                    
                    msg += '\n\n';
                    callback(msg);
                })
            })(data);
        }
        });

        console.log('    Done!')
    };
}


/* -------------------------------------------------------------------------------- */
/* ------------------------------------ HELPERS ----------------------------------- */
/* -------------------------------------------------------------------------------- */

function markdownEscape(string){
    return string.replace(/\_|\*|\[|\]|\(|\)|\~|\`|\>|\#|\+|\-|\=|\||\{|\}|\.|\!/gi, x => {
        return `\\${x}`;
    });
}

/* -------------------------------------------------------------------------------- */
/* ------------------------------------ EXPORTS ----------------------------------- */
/* -------------------------------------------------------------------------------- */

module.exports.HackerNewsProvider = HackerNewsProvider;
module.exports.Provider = Provider;
module.exports.PortSwiggerProvider = PortSwiggerProvider;
module.exports.NEWS_TYPES = NEWS_TYPES;
