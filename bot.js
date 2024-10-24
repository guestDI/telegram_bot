const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const moment = require('moment-timezone');

const token = '7630370286:AAGz6H5lbpJ1xDAqDkIV6f_NJcsQgmNMbtQ';
const bot = new TelegramBot(token, { polling: true });

// Store the chat IDs and users
let chatMembers = {};

// Schedule a poll every Monday at 11:00 AM (server time)
cron.schedule('0 0 11 * * 1', () => {
  for (const chatId in chatMembers) {
    const eventTime = getNextEventTime();
    sendPoll(chatId, eventTime);
  }
});

// Function to send a poll with event time information
function sendPoll(chatId, eventTime) {
  const eventDateString = eventTime.format('dddd, MMMM Do YYYY, HH:mm');
  bot.sendPoll(chatId, `Football: ${eventDateString}`, ['Yes', 'No'], {is_anonymous: false} )
    .then(() => {
      console.log(`Poll sent to chat ${chatId}`);
    })
    .catch((err) => {
      console.error(`Failed to send poll to chat ${chatId}:`, err);
    });
}

// Function to get the next event time (Tuesday at 19:00 CET)
function getNextEventTime() {
  // Get current time in CET
  let now = moment().tz('CET');
  
  // Start from the next Tuesday
  let nextTuesday = now.clone().day(2).hour(19).minute(0).second(0);

  // If the current day is already Tuesday past 19:00, go to the next week
  if (now.isAfter(nextTuesday)) {
    nextTuesday.add(1, 'week');
  }

  return nextTuesday;
}

bot.on('poll_answer', (pollAnswer) => {
    const userId = pollAnswer.user.id;
    const username = pollAnswer.user.username || pollAnswer.user.first_name;
  
    console.log(`User ${username} (ID: ${userId}) voted in poll ${pollAnswer.poll_id}`);
    
    // Optionally, you can track user participation or take further action
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Add chat and member to the tracking list
  if (!chatMembers[chatId]) {
    chatMembers[chatId] = new Set();
  }
  chatMembers[chatId].add(userId);

  // Command to select a random user
  if (msg.text === '/randomuser') {
    const membersArray = Array.from(chatMembers[chatId]);
    const randomUserId = membersArray[Math.floor(Math.random() * membersArray.length)];

    bot.sendMessage(chatId, `Randomly selected: <a href="tg://user?id=${randomUserId}">${randomUserId}</a>`, { parse_mode: 'HTML' });
  }

  // Command to manually start a poll
  if (msg.text === '/startpoll') {
    const eventTime = getNextEventTime();
    sendPoll(chatId, eventTime);
  }
});

// Handle new chat members
bot.on('new_chat_members', (msg) => {
  const chatId = msg.chat.id;
  msg.new_chat_members.forEach((user) => {
    if (!chatMembers[chatId]) {
      chatMembers[chatId] = new Set();
    }
    chatMembers[chatId].add(user.id);
  });
});

// Handle users leaving the chat
bot.on('left_chat_member', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.left_chat_member.id;
  if (chatMembers[chatId]) {
    chatMembers[chatId].delete(userId);
  }
});

console.log('Bot is running...');
