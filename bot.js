const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { getNextEventTime } = require('./utils')

const token = '7630370286:AAGz6H5lbpJ1xDAqDkIV6f_NJcsQgmNMbtQ';
const bot = new TelegramBot(token, { polling: true });

// Store the chat IDs and users
let chatMembers = [];
let eventPollId = null;
let manOfTheMatchPollId = null;
let eventPollAnswers = [];
let scheduledTask = null;

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

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    const inlineMenu = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Recurring poll', callback_data: 'schedule_recurring_poll' },
            { text: 'Event poll', callback_data: 'start_event_poll' },
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
  
    if (query.data === 'start_event_poll') {
      const eventTime = getNextEventTime();
      sendEventPoll(chatId, eventTime);
      bot.answerCallbackQuery(query.id, { text: 'Опрос на событие запущен!' });
    } else if (query.data === 'man_of_the_match') {
      const eventTime = getNextEventTime();
      sendManOfTheMatchPoll(chatId, eventTime);
      bot.answerCallbackQuery(query.id, { text: 'Опрос "Игрок матча" запущен!' });
    } else if (query.data === 'random_user') {
      const randomUserId = chatMembers[Math.floor(Math.random() * chatMembers.length)];
      bot.sendMessage(chatId, `Составы определяет: <a href="tg://user?id=${randomUserId}">${randomUserId}</a>`, { parse_mode: 'HTML' });
      bot.answerCallbackQuery(query.id, { text: 'Случайный пользователь выбран!' });
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
  if (msg.text === '/startpoll') {
    const eventTime = getNextEventTime();
    sendEventPoll(chatId, eventTime);
  }

  if (msg.text === '/manofthematch') {
    const eventTime = getNextEventTime();
    sendManOfTheMatchPoll(chatId, eventTime);
  }

  if(msg.text === '/schedule_recurring_poll') {
    bot.sendMessage(chatId, "Please send me the day and time for scheduling the event in format 'YYYY-MM-DD HH:mm'");
  
    bot.once('message', (dateMsg) => {
      const inputDate = moment(dateMsg.text, 'YYYY-MM-DD HH:mm', true);
  
      if (!inputDate.isValid()) {
        bot.sendMessage(chatId, "Invalid date format. Please use 'YYYY-MM-DD HH:mm'.");
        return;
      }
  
      const date = inputDate.toDate();
  
      const cronExpression = `0 ${date.getMinutes()} ${date.getHours()} * * ${date.getDay()}`;
  
      if (scheduledTask) scheduledTask.destroy(); 
      scheduledTask = cron.schedule(cronExpression, () => {
        sendEventPoll(chatId, inputDate); 
      });
  
      bot.sendMessage(chatId, `Event scheduled for ${inputDate.format('dddd, MMMM Do YYYY, HH:mm')}`);
    });
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
