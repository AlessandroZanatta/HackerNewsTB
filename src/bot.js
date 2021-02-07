'use strict'
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const debug = require('debug');

const users = require('./users');
const providers = require('./providers');

/* -------------------------------------------------------------------------------- */
/* --------------------- Bot configuration and global variables ------------------- */
/* -------------------------------------------------------------------------------- */

// Setup logger
const logger = debug('LOG    Bot: ');
const error = debug('ERROR    Bot: ');

// set this namespace to log via console.log
logger.log = console.log.bind(console);

// Bot Token from environment
const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

// Used to keep track of users who started a chat with the bot
const USERS_FILE = 'data/users.json';
const USER_TRACKER = new users.UsersTracker(USERS_FILE);

// List of news providers
const HACKER_NEWS         = new providers.HackerNewsProvider();

const DAILY_SWIG          = new providers.RSSProvider('The Daily Swig'      , 'https://portswigger.net/daily-swig/rss');
const LATEST_HACKING_NEWS = new providers.RSSProvider('Latest Hacking News' , 'https://latesthackingnews.com/feed');
const THE_HACKER_NEWS     = new providers.RSSProvider('The Hacker News'     , 'https://feeds.feedburner.com/TheHackersNews');
const WE_LIVE_SECURITY    = new providers.RSSProvider('We Live Security'    , 'https://welivesecurity.com/feed');
const HACKER_ONE          = new providers.RSSProvider('HackerOne'           , 'https://hackerone.com/blog.rss');
const REDDIT              = new providers.RSSProvider('Reddit'              , 'https://www.reddit.com/r/hacking/.rss?format=xml')

const PROVIDERS = [
    // HACKER_NEWS,
    DAILY_SWIG,
    LATEST_HACKING_NEWS,
    THE_HACKER_NEWS,
    WE_LIVE_SECURITY,
    HACKER_ONE,
    REDDIT,
]   

// Schedule providers update at midnight
PROVIDERS.forEach(provider => {
    logger(`Scheduling update of ${provider.getProviderName()}`)
    schedule.scheduleJob('0 0 * * *', provider.updateNews());
});

// Schedule blacklist cleanup every six month
// PROVIDERS.forEach(provider => {
//     logger(`Scheduling deletion of blacklist for ${provider.getProviderName()}`)
//     schedule.scheduleJob('0 0 0 */6 *', provider.cleanBlacklist());
// });

let USERS_WHITELIST = ['k41ex'];

/* -------------------------------------------------------------------------------- */
/* --------------------------------- Bot callbacks -------------------------------- */
/* -------------------------------------------------------------------------------- */

// Keep the list of subscribed users!
bot.onText(/\/start/, (msg, _) => {

    const chatId = msg.chat.id;
    logger(`New user: ${chatId}`);

    let username = '';

    if(msg.chat.username !== undefined){
        username = ` ${msg.chat.username}`;
    }
    
    const welcomeMessage = `Welcome${username}!
    
You will be receiving news three times a day!
It will be at about breakfast, launch and dinner time!`;

    USER_TRACKER.addUser(chatId);

    bot.sendMessage(chatId, welcomeMessage);    
});

// Send help on "/help"
bot.onText(/\/help/, (msg, match) => {

    const chatId = msg.chat.id;

    const helpMessage = `
    I can help you staying up-to-date with hacking/tech news!
    
Here are the commands to control me:


    /help              Show this help
    /news (on|off)     Turn on/off news
    `;

    bot.sendMessage(chatId, helpMessage);
});

bot.onText(/\/news (on|off)/, (msg, match) => {
    
    const choice = match[1];
    const chatId = msg.chat.id;

    if (choice === 'on'){
        if(USER_TRACKER.addUser(chatId)){
            logger(`Added user ${chatId} to news list!`);
            bot.sendMessage(chatId, 'Subscribed to news!');
        } else {
            bot.sendMessage(chatId, 'You\'re already subscribed!');
        }
    } else if (choice === 'off'){
        USER_TRACKER.removeUser(chatId);
        logger(`Removed user ${chatId} from news list!`);
        bot.sendMessage(chatId, 'Unsubscribed from daily news... :(');
    }

    // If you end down there, there's something awfully wrong...
})

// Schedule sending of messages at given hours

// Since it uses UTC and in Italy we shift between UTC+1 and UTC+2
const UTC_CORRECTION = -1; // TODO

const BREAKFAST_HOUR = 8 + UTC_CORRECTION;
const LAUNCH_HOUR = 14 + UTC_CORRECTION;
const DINNER_HOUR = 21 + UTC_CORRECTION;

let rule = new schedule.RecurrenceRule();
rule.hour = [BREAKFAST_HOUR, DINNER_HOUR];
rule.minute = 0;

schedule.scheduleJob(rule, async function(){

    logger(`Collecting news...`);

    const news = await getFormattedNews();
    logger(`Sending news...`);
    
    // Send news to all subscribed users
    USER_TRACKER.listUsers().forEach(userId => {
        bot.sendMessage(userId, news, {'parse_mode': 'MarkdownV2'});
        logger(`    Sent to ${userId}`);
    });
    
    logger(`Sent to everybody!`);
});


/* -------------------------------------------------------------------------------- */
/* ---------------------------------- Functions ----------------------------------- */
/* -------------------------------------------------------------------------------- */


function isWhitelisted(username){
    return USERS_WHITELIST.includes(username);
}

function acceptedRequest(msg, calledOn){
    const username = msg.chat.username;

    logger(`${username} --> ${calledOn[0]} `);

    if(!isWhitelisted(username)){
        error(`User ${username} is not in whitelist, dropping request...`)
        return false;
    }
    
    return true;
}

function markdownEscape(string){
    return string.replace(/\_|\*|\[|\]|\(|\)|\~|\`|\>|\#|\+|\-|\=|\||\{|\}|\.\!/gi, x => {
        return `\\${x}`;
    });
}

async function getFormattedNews(){

    let message = 'Here\'s the latest news:\n\n';
    let found = 0;

    for(let i = 0; i < PROVIDERS.length; i++){
        let provider = PROVIDERS[i];
        
        try {
            let news = await providers.getNewsWrapper(provider);
            message += `${provider.getProviderName()}: [${markdownEscape(news.news.title)}](${markdownEscape(news.news.link)})\n\n`;
            found++;
        } catch(err) {
            // Ignore news that returned an error promise, there simply were no news!
        }
    }

    if (found > 0){ // if we got at least one new news, return it
        return message;
    } else {
        return 'There\'s nothing new... :('
    }
}
