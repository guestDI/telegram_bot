const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { getNextEventTime } = require('./utils')
const moment = require('moment-timezone');

const token = '7630370286:AAGz6H5lbpJ1xDAqDkIV6f_NJcsQgmNMbtQ';
const bot = new TelegramBot(token, { polling: true });

// Store the chat IDs and users
let chatMembers = [];
let eventPollId = null;
let manOfTheMatchPollId = null;
let eventPollAnswers = [];
let scheduledTask = null;
const pollTasks = {};

// Schedule a poll every Monday at 11:00 AM (server time)
cron.schedule('0 0 11 * * 1', () => {
  for (const chatId in chatMembers) {
    const eventTime = getNextEventTime();
    sendEventPoll(chatId, eventTime);
  }
});

cron.schedule('0 0 21 * * 2', () => {
    for (const chatId in chatMembers) {
      const eventTime = getNextEventTime();
      sendManOfTheMatchPoll(chatId, eventTime);
    }
  });

  bot.onText('start', (msg) => {
    const chatId = msg.chat.id;
    
    const inlineMenu = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Recurring poll', callback_data: 'schedule_recurring_poll' },
            { text: 'Event poll', callback_data: 'send_event_poll' },
            { text: 'Man of the match', callback_data: 'man_of_the_match' },
          ],
          [
            { text: 'Random user', callback_data: 'random_user' },
          ],
        ],
      },
    };
  
    bot.sendMessage(chatId, 'What do you want do:', inlineMenu);
  });

  bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
  
    if (query.data === 'schedule_recurring_poll') {
        scheduleRecurringPoll(query.message)
        bot.answerCallbackQuery(query.id, { text: 'Recurring poll is set!' });
      } else if (query.data === 'send_event_poll') {
      const eventTime = getNextEventTime();
      sendEventPoll(chatId, eventTime);
    } else if (query.data === 'man_of_the_match') {
      const eventTime = getNextEventTime();
      sendManOfTheMatchPoll(chatId, eventTime);
      bot.answerCallbackQuery(query.id, { text: 'Опрос "Игрок матча" запущен!' });
    } else if (query.data === 'random_user') {
      const randomUserId = chatMembers[Math.floor(Math.random() * chatMembers.length)];
      bot.sendMessage(chatId, `Составы определяет: <a href="tg://user?id=${randomUserId}">${randomUserId}</a>`, { parse_mode: 'HTML' });
    }
  });

// Function to send a poll with event time information
function sendEventPoll(chatId, eventTime) {
  const eventDateString = eventTime.format('dddd, MMMM Do YYYY, HH:mm');
  bot.sendPoll(chatId, `Football: ${eventDateString}`, ['Yes', 'No'], {is_anonymous: false} )
    .then((poll) => {
      eventPollId = poll.poll.id;    
      chatMembers = [];              
      eventPollAnswers = [];        
      console.log(`Poll sent to chat ${chatId}`);
    })
    .catch((err) => {
      console.error(`Failed to send poll to chat ${chatId}:`, err);
    });
}

function sendManOfTheMatchPoll(chatId, eventTime) {
    const eventDateString = eventTime.format('dddd, MMMM Do YYYY');
    bot.sendPoll(chatId, `Man of the match: ${eventDateString}`, [...chatMembers, '-'] )
      .then(() => {
        manOfTheMatchPollId = poll.poll.id;
        console.log(`Poll sent to chat ${chatId}`);
      })
      .catch((err) => {
        console.error(`Failed to send poll to chat ${chatId}:`, err);
      });
  }

function scheduleRecurringPoll(msg){
    const chatId = msg.chat.id;
  
    bot.sendMessage(chatId, "Please enter day, time and number of occurencies (optional) in the following format:\n\n*day (from 0 to 6) time [num of occurencies]*\n\nExample: `0 15:00 10` or `3 18:30` where 0 is Sunday and 3 is Wednesday ", { parse_mode: 'Markdown' });
    
    bot.once('message', (dateMsg) => {
      const input = dateMsg.text.split(' ');
      if (input.length < 2) {
        bot.sendMessage(chatId, "Wrong format. Please, enter day (0-6) and time.");
        return;
      }
  
      const day = input[0].toLowerCase();
      const time = input[1];
      const repeatCount = input[2] ? parseInt(input[2], 10) : Infinity;
      const dayMapping = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      if (Number(day) == NaN || Number(day) > 6 || Number(day) < 0 || !moment(time, 'HH:mm', true).isValid()) {
        bot.sendMessage(chatId, "Wrond format for a day or time. Please try again.");
        
        return;
      }
  
      const [hour, minute] = time.split(':').map(Number);
      const cronExpression = `0 ${minute} ${hour} * * ${day}`;
  
      let count = 0;
      pollTasks[chatId] = cron.schedule(cronExpression, () => {
        if (count >= repeatCount) {
          pollTasks[chatId].stop();
          bot.sendMessage(chatId, "Recurring day is finished.");
          return;
        }
        count++;
        sendRecurringPoll(chatId, day, time);
      });
  
      bot.sendMessage(chatId, `Recurring poll is scheduled for ${dayMapping[day]} at ${time}. ${repeatCount === Infinity ? 'Poll doesn\'t have finish date.' : `Number of occurencies: ${repeatCount}.`}`);
    });
}  

function sendRecurringPoll(chatId, day, time) {
    const eventTime = moment().day(day).hour(parseInt(time.split(':')[0])).minute(parseInt(time.split(':')[1]));
    const eventDateString = eventTime.format('dddd, MMMM Do YYYY, HH:mm');
    
    bot.sendPoll(chatId, `Football Event: ${eventDateString}`, ['Yes', 'No'], { is_anonymous: false })
      .then(() => {
        console.log(`Recurring poll sent to chat ${chatId}`);
      })
      .catch((err) => {
        console.error(`Failed to send recurring poll to chat ${chatId}:`, err);
      });
  }
  
  // Команда для отмены регулярного опроса
  bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    
    if (pollTasks[chatId]) {
      pollTasks[chatId].stop();
      delete pollTasks[chatId];
      bot.sendMessage(chatId, "Регулярный опрос отменен.");
    } else {
      bot.sendMessage(chatId, "Нет активных регулярных опросов для отмены.");
    }
  });

bot.on('poll_answer', (pollAnswer) => {
    const pollId = pollAnswer.poll_id;
    const userId = pollAnswer.user.id;
    const username = pollAnswer.user.username || pollAnswer.user.first_name;

    
    if (pollId === eventPollId) {
        console.log(`User ${username} (ID: ${userId}) voted in the Event poll.`);
        chatMembers.push(username); 
      }
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.text === '/randomuser') {
    const randomUserId = chatMembers[Math.floor(Math.random() * chatMembers.length)];

    bot.sendMessage(chatId, `Teams are on: <a href="tg://user?id=${randomUserId}">${randomUserId}</a>`, { parse_mode: 'HTML' });
  }

  // Command to manually start a poll
  if (msg.text === '/sendpoll') {
    const eventTime = getNextEventTime();
    sendEventPoll(chatId, eventTime);
  }

  if (msg.text === '/manofthematch') {
    const eventTime = getNextEventTime();
    sendManOfTheMatchPoll(chatId, eventTime);
  }

  if(msg.text === '/schedule_recurring_poll') {
    scheduleRecurringPoll(msg)
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
