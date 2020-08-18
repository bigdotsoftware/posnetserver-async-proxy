'use strict';

const path = require('path');
const fs = require('fs');
const winston = require('winston');
require('winston-daily-rotate-file');

const tsFormat = () => (new Date()).toLocaleTimeString("en-US", {hour12: false}) + '.' + (new Date()).getMilliseconds();

//const logDirectory = config.logger.nodejs.path;// 'log';//path.join(__dirname, 'log');
const logDirectory = path.join(__dirname, 'log');
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);

const logger = winston.createLogger({
  transports: [
    // colorize the output to the console
    new (winston.transports.Console)({
      timestamp: tsFormat,
      colorize: true,
      level: 'debug',
    }),
    new (winston.transports.DailyRotateFile)({
      filename: `${logDirectory}/log`,
      timestamp: tsFormat,
      datePattern: 'yyyy-MM-dd.',
      prepend: true,
      handleExceptions: true,
      level: process.env.ENV === 'development' ? 'debug' : 'debug',
      //level: process.env.ENV === 'development' ? 'debug' : 'info',
    }),
  ],
});

module.exports.logger = logger;