const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { getNextEventTime } = require('./utils');
const moment = require('moment-timezone');

const token = '7630370286:AAGz6H5lbpJ1xDAqDkIV6f_NJcsQgmNMbtQ';
const bot = new TelegramBot(token, { polling: true });

// Store the chat members and polls
let chatMembers = [];
const peopleToAttend = [];
let eventPollId = null;
let manOfTheMatchPollId = null;
let eventPollAnswers = [];
const pollTasks = {};

// Inline menu command
bot.onText(/start/, (msg) => {
  const chatId = msg.chat.id;
  const inlineMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Recurring poll', callback_data: 'schedule_recurring_poll' },
          { text: 'Event poll', callback_data: 'send_event_poll' },
          { text: 'Man of the match', callback_data: 'man_of_the_match' },
        ],
        [{ text: 'Random user', callback_data: 'random_user' }],
      ],
    },
  };

  bot.sendMessage(chatId, 'What do you want to do:', inlineMenu);
});

// Handling inline menu options
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  switch (query.data) {
    case 'schedule_recurring_poll':
      scheduleRecurringPoll(query.message);
      bot.answerCallbackQuery(query.id, { text: 'Recurring poll is set!' });
      break;

    case 'send_event_poll':
      sendEventPoll(chatId, getNextEventTime());
      break;

    case 'man_of_the_match':
      sendManOfTheMatchPoll(chatId, getNextEventTime());
      bot.answerCallbackQuery(query.id, { text: 'Man of the Match poll started!' });
      break;

    case 'random_user':
      const randomUserId = chatMembers[Math.floor(Math.random() * chatMembers.length)];
      bot.sendMessage(
        chatId,
        `Teams are on: <a href="tg://user?id=${randomUserId}">${randomUserId}</a>`,
        { parse_mode: 'HTML' }
      );
      break;
  }
});

// Function to send a poll with event time information
function sendEventPoll(chatId, eventTime) {
  const eventDateString = eventTime.format('dddd, MMMM Do YYYY, HH:mm');
  bot.sendPoll(chatId, `Football Event: ${eventDateString}`, ['Yes', 'No'], { is_anonymous: false })
    .then((poll) => {
      eventPollId = poll.poll.id;
      chatMembers = [];
      eventPollAnswers = [];
      console.log(`Event poll sent to chat ${chatId}`);
    })
    .catch((err) => console.error(`Failed to send event poll to chat ${chatId}:`, err));
}

// Function to send "Man of the Match" poll
function sendManOfTheMatchPoll(chatId, eventTime) {
  const eventDateString = eventTime.format('dddd, MMMM Do YYYY');
  bot.sendPoll(chatId, `Man of the Match: ${eventDateString}`, [...peopleToAttend, '-'])
    .then((poll) => {
      manOfTheMatchPollId = poll.poll.id;
      console.log(`Man of the Match poll sent to chat ${chatId}`);
    })
    .catch((err) => console.error(`Failed to send Man of the Match poll to chat ${chatId}:`, err));
}

// Function to schedule a recurring poll
function scheduleRecurringPoll(msg) {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Please enter day, time and number of occurrences (optional) in the following format:\n\n*day (0-6) time [number]*\n\nExample: `0 15:00 10` or `3 18:30`", {
    parse_mode: 'Markdown',
  });

  bot.once('message', (dateMsg) => {
    const input = dateMsg.text.split(' ');
    if (input.length < 2) {
      bot.sendMessage(chatId, "Incorrect format. Please, enter day (0-6) and time.");
      return;
    }

    const day = input[0];
    const time = input[1];
    const repeatCount = input[2] ? parseInt(input[2], 10) : Infinity;

    if (isNaN(day) || day < 0 || day > 6 || !moment(time, 'HH:mm', true).isValid()) {
      bot.sendMessage(chatId, "Incorrect day or time format. Please try again.");
      return;
    }

    const [hour, minute] = time.split(':').map(Number);
    const cronExpression = `0 ${minute} ${hour} * * ${day}`;

    let count = 0;
    pollTasks[chatId] = cron.schedule(cronExpression, () => {
      if (count >= repeatCount) {
        pollTasks[chatId].stop();
        bot.sendMessage(chatId, "Recurring poll finished.");
        return;
      }
      count++;
      sendRecurringPoll(chatId, day, time);
    });

    bot.sendMessage(chatId, `Recurring poll scheduled for day ${day} at ${time}. ${repeatCount === Infinity ? 'Poll will repeat indefinitely.' : `Occurrences: ${repeatCount}.`}`);
  });
}

// Function to send a recurring poll
function sendRecurringPoll(chatId, day, time) {
  const eventTime = moment().day(day).hour(parseInt(time.split(':')[0])).minute(parseInt(time.split(':')[1]));
  const eventDateString = eventTime.format('dddd, MMMM Do YYYY, HH:mm');

  bot.sendPoll(chatId, `Football Event: ${eventDateString}`, ['Yes', 'No'], { is_anonymous: false })
    .then(() => console.log(`Recurring poll sent to chat ${chatId}`))
    .catch((err) => console.error(`Failed to send recurring poll to chat ${chatId}:`, err));
}

// Cancel a recurring poll
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;

  if (pollTasks[chatId]) {
    pollTasks[chatId].stop();
    delete pollTasks[chatId];
    bot.sendMessage(chatId, "Recurring poll canceled.");
  } else {
    bot.sendMessage(chatId, "No active recurring polls to cancel.");
  }
});

function addPerson(msg) {
    const chatId = msg.chat.id;
  
    bot.sendMessage(chatId, "Enter a name or names using (,) comma:", {
      parse_mode: 'Markdown'
    });
  
    bot.once('message', (nameMsg) => {
      const names = nameMsg.text.split(',').map(name => name.trim());
  
      names.forEach(name => peopleToAttend.push(name));

      const membersList = peopleToAttend
        .map((member, index) => `${index + 1}. ${member}`)
        .join('\n');
  
      const membersMessage = `<b>Participants:</b>\n${membersList}`;
    
    bot.sendMessage(chatId, membersMessage, { parse_mode: 'HTML' });
    });
  }
  
  bot.onText(/\/addPerson/, (msg) => {
    addPerson(msg);
  });

// Handle poll answers
bot.on('poll_answer', (pollAnswer) => {
  const pollId = pollAnswer.poll_id;
  const userId = pollAnswer.user.id;
  const username = pollAnswer.user.username || pollAnswer.user.first_name;

  if (pollId === eventPollId) {
    console.log(`User ${username} (ID: ${userId}) voted in the Event poll.`);
    // make it more strict
    if(pollAnswer.option_ids[0] === 0) {
        peopleToAttend.push(username)
    }
    chatMembers.push(username);
  }
});

// Handle /randomuser command
bot.onText(/\/randomuser/, (msg) => {
  const chatId = msg.chat.id;
  const randomUserId = chatMembers[Math.floor(Math.random() * chatMembers.length)];
  bot.sendMessage(chatId, `Teams are on: <a href="tg://user?id=${randomUserId}">${randomUserId}</a>`, {
    parse_mode: 'HTML',
  });
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
