'use strict'
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');

const providers = require('./providers');

/* -------------------------------------------------------------------------------- */
/* --------------------- Bot configuration and global variables ------------------- */
/* -------------------------------------------------------------------------------- */

// Bot Token from environment
const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

// List of news providers
const HACKER_NEWS = new providers.HackerNewsProvider();
const DAILY_SWIG = new providers.PortSwiggerProvider()

const PROVIDERS = [
    HACKER_NEWS,
    DAILY_SWIG,
]

// Schedule providers update at midnight
PROVIDERS.forEach(provider => {
    console.log(`[BOT] Scheduling update of ${provider.getProviderName()}`)
    schedule.scheduleJob('0 0 0 * *', provider.updateNews());
});

// Schedule blacklist cleanup at the end of each month
PROVIDERS.forEach(provider => {
    console.log(`[BOT] Scheduling deletion of blacklist for ${provider.getProviderName()}`)
    schedule.scheduleJob('0 0 0 1 *', provider.cleanBlacklist());
});

let USERS_WHITELIST = ['AlessandroZanattaK'];

/* -------------------------------------------------------------------------------- */
/* --------------------------------- Bot callbacks -------------------------------- */
/* -------------------------------------------------------------------------------- */

// Send help on "/help"
bot.onText(/\/help/, (msg, match) => {

    if(!acceptedRequest(msg, match)){
        return;
    }

    const chatId = msg.chat.id;

    const helpMessage = `
    I can help you staying up to date with tech news!
    
Here are the commands to control me:


    /help                        Show this help
    /hackernews [new|top|best]   Get a random news from HackerNews
    /swig                        Get list of news from PortSwigger's Daily Swig
    `;
    console.log('hey3');

    bot.sendMessage(chatId, helpMessage);
});

// Send a new news on "/news"
bot.onText(/\/hackernews(.*)/, (msg, match) => {

    if(!acceptedRequest(msg, match)){
        return;
    }

    const chatId = msg.chat.id;

    const requestedType = match[1];

    let chosenType = providers.NEWS_TYPES.new;
    
    if(requestedType.length > 0 && providers.NEWS_TYPES.isDefined(requestedType.substring(1))){
        chosenType = providers.NEWS_TYPES.get(requestedType);
    }

    HACKER_NEWS.getNews(chosenType, url => {
        bot.sendMessage(chatId, url);
    });
});

bot.onText(/\/swig/, (msg, match) => {

    if(!acceptedRequest(msg, match)){
        return;
    }

    const chatId = msg.chat.id;

    DAILY_SWIG.getNews(msg => {
        bot.sendMessage(chatId, msg, {parse_mode : "MarkdownV2"});
    })
});


/* -------------------------------------------------------------------------------- */
/* ---------------------------------- Functions ----------------------------------- */
/* -------------------------------------------------------------------------------- */


function isWhitelisted(username){
    return USERS_WHITELIST.includes(username);
}

function acceptedRequest(msg, calledOn){
    const username = msg.chat.username;

    console.log(`[BOT] ${username} --> ${calledOn[0]} `);

    if(!isWhitelisted(username)){
        console.log('    User is not in whitelist, dropping request...')
        return false;
    }
    
    return true;
}
