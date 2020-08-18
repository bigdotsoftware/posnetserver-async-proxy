'use strict';

const logger = require('./logger');
const nodeVersion = require('parse-node-version')(process.version);
const tasks_manager = require('./tasks_manager');
const restapi = require('./restapi');

//###################################################
//                  Config
//###################################################
const yaml_config = require('node-yaml-config');
var config = yaml_config.load(__dirname + '/config.yml');
const buildVersion = '1.0.0';

//###################################################
//                  Initialization
//###################################################
if (nodeVersion.major < 10)
    logger.logger.error('Minimum node.js version is 10.x : ' + process.version);
else
    logger.logger.info('Minimum node.js version is 10.x : ' + process.version);


//###################################################
//              Init the RESTful API
//###################################################
logger.logger.info('Starting PosnetServer RESTful API');
restapi.init(
    { port: config.http.port },
    { active: config.https.active, port: config.https.port, sslcertificates: { key: config.https.key, crt: config.https.crt } },
    { buildVersion: buildVersion, fulldebug: config.fulldebug }
);
tasks_manager.init(
    { }
);


