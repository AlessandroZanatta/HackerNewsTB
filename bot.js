require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const providers = require('./providers');

// Bot Token from environment
const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

// Where to save state data
const NEWS_DIR = 'news_data';


const PROVIDERS = [new providers.HackerNewsProvider()]

// Schedule providers update
PROVIDERS.forEach(provider => {
    schedule.scheduleJob('0 0 * * *', provider.updateNews());
});



// Send help on "/help"
bot.onText(/\/help/, (msg, _) => {

    if(!isFromOwner){
        return;
    }
  
    const chatId = msg.chat.id;

    helpMessage = `
    I can help you staying up to date with tech news!
    
    Here are the commands to control me:


    /help
    /news
    `;

    bot.sendMessage(chatId, helpMessage);
});


bot.onText(/\/news(.)*/, (msg, match) => {

    if(!isFromOwner){
        return;
    }

    const chatId = msg.chat.id;

    bot.sendMessage(chatId, chatId);
});

// bot.onText(/\/best/, (msg, _) => {
//     const chatId = msg.chat.id;
// });


function isFromOwner(id){
    const ownerId = '1068272545';
    return id === ownerId;
}