const moment = require('moment-timezone');

function getNextEventTime() {
    let now = moment().tz('CET');
    
    // Start from the next Tuesday
    let nextTuesday = now.clone().day(2).hour(19).minute(0).second(0);
  
    // If the current day is already Tuesday past 19:00, go to the next week
    if (now.isAfter(nextTuesday)) {
      nextTuesday.add(1, 'week');
    }
  
    return nextTuesday;
}

module.exports = {
    getNextEventTime
}