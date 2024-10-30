const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { getNextEventTime } = require('./utils');
const moment = require('moment-timezone');

const token = '7630370286:AAGz6H5lbpJ1xDAqDkIV6f_NJcsQgmNMbtQ';
const bot = new TelegramBot(token, { polling: true });

const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Store the chat members and polls
let chatMembers = [];
const peopleToAttend = [];
let eventPollId = null;
let manOfTheMatchPollId = null;
let eventPollAnswers = [];
const pollTasks = new Map(); 

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
        [
          { text: 'Random user', callback_data: 'random_user' },
          { text: 'Show all recurring polls', callback_data: 'show_all_polls' },
          { text: 'Add participant', callback_data: 'add' },
        ]
      ],
    },
  };

  bot.sendMessage(chatId, 'What do you want to do:', inlineMenu);
});

// Handling inline menu options
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;

  if (query.data.startsWith('cancel_poll')) {
    cancelRecurringPoll(query)
  }

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

    case 'show_all_polls': 
      showAllPolls(chatId);
      bot.answerCallbackQuery(query.id);
      break;  

    case 'add': 
      addParticipant(chatId);
      bot.answerCallbackQuery(query.id);
      break;    

    case 'random_user':
      const randomUserId = chatMembers[Math.floor(Math.random() * chatMembers.length)];
      if(!randomUserId) {
        bot.sendMessage(
            chatId,
            'There are no participants yet'
          );
      } else {
        bot.sendMessage(
            chatId,
            `Teams are on: <a href="tg://user?id=${randomUserId}">${randomUserId}</a>`,
            { parse_mode: 'HTML' }
          );
      }
      
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
function sendManOfTheMatchPoll(chatId) {
  bot.sendPoll(chatId, 'Man of the Match:', [...peopleToAttend, '-'])
    .then((poll) => {
      manOfTheMatchPollId = poll.poll.id;
      console.log(`Man of the Match poll sent to chat ${chatId}`);
    })
    .catch((err) => console.error(`Failed to send Man of the Match poll to chat ${chatId}:`, err));
}

// Function to schedule a recurring poll
function scheduleRecurringPoll(msg) {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "Enter the poll title and options, separated by commas:\nExample: `Event Poll, Yes, No`", { parse_mode: 'Markdown' });

  bot.once('message', (pollMsg) => {
    const pollInput = pollMsg.text.split(',').map(item => item.trim());

    if (pollInput.length < 2) {
      bot.sendMessage(chatId, "Incorrect format. Please, enter a title and at least one option.");
      return;
    }

    const pollTitle = pollInput[0];
    const pollOptions = pollInput.slice(1);

    bot.sendMessage(chatId, "Please enter day (0-6) and time in format `day time [number of occurrences]`:\nExample: `0 15:00 10`", { parse_mode: 'Markdown' });

    bot.once('message', (dateMsg) => {
      const input = dateMsg.text.split(' ');
      if (input.length < 2) {
        bot.sendMessage(chatId, "Incorrect format. Please, enter day and time.");
        return;
      }

      const day = parseInt(input[0]);
      const time = input[1];
      const repeatCount = input[2] ? parseInt(input[2], 10) : Infinity;

      if (isNaN(day) || day < 0 || day > 6 || !moment(time, 'HH:mm', true).isValid()) {
        bot.sendMessage(chatId, "Incorrect day or time format. Please try again.");
        return;
      }

      const [hour, minute] = time.split(':').map(Number);
      const cronExpression = `0 ${minute} ${hour} * * ${day}`;
      const taskId = `${day}-${hour}-${minute}-${Date.now()}`;

      let count = 0;
      const task = cron.schedule(cronExpression, () => {
        if (count >= repeatCount) {
          pollTasks[chatId].stop();
          pollTasks.delete(taskId);
          bot.sendMessage(chatId, "Recurring poll finished.");
          return;
        }
        count++;
        sendRecurringPoll(chatId, pollTitle, pollOptions);
      });

      pollTasks.set(taskId, { task, chatId, day, time, repeatCount, pollTitle });
      bot.sendMessage(chatId, `Recurring poll scheduled: ${pollTitle}. Day: ${daysMap[day]} at ${time}. ${repeatCount === Infinity ? 'Poll will repeat indefinitely.' : `Occurrences: ${repeatCount}.`}`);
    });
  });
}

function showAllPolls(chatId) {
    if (pollTasks.size === 0) {
      bot.sendMessage(chatId, "No recurring polls scheduled.");
      return;
    }

    // Create inline keyboard with a cancel button for each poll
    const pollButtons = Array.from(pollTasks).map(([id, { day, time, pollTitle }]) => {
        return [
            { text: `${pollTitle} on ${daysMap[day]} at ${time}`, callback_data: `cancel_poll_${id}` }
        ]
    });
  
    const keyboard = { reply_markup: { inline_keyboard: pollButtons } };
    bot.sendMessage(chatId, "Here are your scheduled polls. Click on a poll you want to cancel:", keyboard);
  }

// Function to send a recurring poll
function sendRecurringPoll(chatId, title, options) {
  const eventTime = moment().day(day).hour(parseInt(time.split(':')[0])).minute(parseInt(time.split(':')[1]));
  const eventDateString = eventTime.format('dddd, MMMM Do YYYY, HH:mm');

  bot.sendPoll(chatId, title, options, { is_anonymous: false })
    .then(() => console.log(`Recurring poll "${title}" sent to chat ${chatId}`))
    .catch((err) => console.error(`Failed to send recurring poll "${title}" to chat ${chatId}:`, err));
}

function cancelRecurringPoll(query) {
    const taskId = query.data.replace('cancel_poll_', '');
    const taskData = pollTasks.get(taskId);

    if (taskData) {
      taskData.task.stop();
      pollTasks.delete(taskId);
      bot.answerCallbackQuery(query.id, { text: `Cancelled poll on ${daysMap[taskData.day]} at ${taskData.time}.` });
      bot.sendMessage(query.message.chat.id, `Cancelled poll on ${daysMap[taskData.day]} at ${taskData.time}.`);
    } else {
      bot.answerCallbackQuery(query.id, { text: "Poll not found or already cancelled." });
    }
}

function addParticipant(chatId) {  
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
  
  bot.onText(/\/add/, (msg) => {
    addParticipant(msg);
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
