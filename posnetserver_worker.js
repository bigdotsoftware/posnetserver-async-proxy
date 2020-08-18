'use strict';

const logger = require('./logger');
const async = require('async');
var rp = require('request-promise');

//###################################################
// run with node --experimental-worker index.js on Node.js 10.x or higher
//###################################################
const { workerData, parentPort } = require('worker_threads');

//###################################################
//                  Config
//###################################################
const yaml_config = require('node-yaml-config');
var config = yaml_config.load(__dirname + '/config.yml');
const tt_start = new Date().getTime();

logger.logger.info(`Processing transaction ${workerData.transactionUUID} in separate thread`);

var newurl = config.posnetserver.baseurl + '/' + workerData.restpoint;
ExecuteUrl(newurl, null, workerData.payload, parentPort);

function ExecuteUrl(url, resultsurlmethod, body, parentPort) {
    logger.logger.debug(`Executing ${url}`);
    var apiMethodWrapper = function (acallback) {
        logger.logger.debug(`Preparing request to ${url}`);

        var options = {
            uri: url,
            method: 'POST',
            body: body,
            headers: {
                'Content-Type': 'application/json'
            },
            json: true
        };

        rp(options)
            .then(function (repos) {
                const took = new Date().getTime() - tt_start;
                logger.logger.debug(`Transaction ${workerData.transactionUUID} executed ok, took: ${took} ms`);
                logger.logger.debug(`Response from transaction ${workerData.transactionUUID} : ${repos}`);
                acallback(null, repos);//ok, no need to retry
            })
            .catch(function (err) {
                const took = new Date().getTime() - tt_start;
                logger.logger.warn(`Retry transaction ${workerData.transactionUUID}, so far took: ${took} ms`);
                logger.logger.debug(err);
                acallback(err.message != null ? err.message : ' Unknown error');    //retry
            });
    };

    async.retry({ times: config.posnetserver.retry.times, interval: config.posnetserver.retry.interval }, apiMethodWrapper, function (err, responseObj) {
        logger.logger.debug(`Transaction ${workerData.transactionUUID} is Done`);
        if (err) {
            logger.logger.error(`Transaction ${workerData.transactionUUID} failed : ${err}`);
            parentPort.postMessage({
                transactionUUID: workerData.transactionUUID,
                stat: { ok: false, message : err },
                status: 'Done'
            })
        } else {
            logger.logger.info(`Transaction ${workerData.transactionUUID} succeeded`);
            parentPort.postMessage({
                transactionUUID: workerData.transactionUUID,
                stat: responseObj,
                status: 'Done'
            })
        }
    });

}