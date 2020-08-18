'use strict';

const logger = require('./logger');
const uuid = require('uuid-random');
const worker = require('worker_threads');
const yaml_config = require('node-yaml-config');

//###################################################
//                  Config
//###################################################
var config = yaml_config.load(__dirname + '/config.yml');
var asyncTransactions = {};

function executeTask(transactionUUID, fulldebug) {
    if (worker.isMainThread) {
        

        var workerone = new worker.Worker('./posnetserver_worker.js', {
            workerData: {
                transactionUUID: transactionUUID,
                restpoint: asyncTransactions[transactionUUID][0].restpoint,
                payload: asyncTransactions[transactionUUID][0].payload,
                fulldebug: fulldebug
            }
        });
        logger.logger.info(`Executing ${transactionUUID} from the main thread`);

        workerone.on('message', (data) => {
            //console.log("message", data);
            const truuid = data.transactionUUID;
            updateTransaction(truuid, data.stat);
        })

        workerone.on('error', (err) => {
            //console.log(err);
            logger.logger.error(`Transaction ${transactionUUID} finished with ERROR: ${err}`);
            workerone = null;
        })

        workerone.on('exit', (code) => {
            if (code != 0)
                logger.logger.error(`Transaction ${transactionUUID} stopped with exit code ${code}`)
            workerone = null;
        })
    }
}

function createTransaction(restpoint, body) {
    const transactionUUID = uuid();
    asyncTransactions[transactionUUID] = [{ payload: body, restpoint: restpoint, ts: new Date().getTime(), retries:[], inprogress: true, stat: null }];
    return transactionUUID;
}

function retryTransaction(transactionUUID) {
    asyncTransactions[transactionUUID].forEach(item => {
        item.inprogress = true;
        item.stat = null;
        item.retries.push(new Date().getTime());
    });
    return transactionUUID;
}

function updateTransaction(transactionUUID, stat) {
    logger.logger.debug(`Updating transaction ${transactionUUID} by the stat: ${stat}`);
    asyncTransactions[transactionUUID][0].stat = stat;
    asyncTransactions[transactionUUID][0].inprogress = false;
}

function calcExpirationTs(ts) {
    const nn = new Date().getTime();
    return (config.queue.retention + ts - nn);
}

function calculateTransactionsResult() {
    var results = {
        paragon: {
            total: 0,
            inprogress: 0,
            success: 0,
            failed: 0,
            items: []
        },
        faktura: {
            total: 0,
            inprogress: 0,
            success: 0,
            failed: 0,
            items: []
        },
        command: {
            total: 0,
            inprogress: 0,
            success: 0,
            failed: 0,
            items: []
        }
    }

    for (const [key, value] of Object.entries(asyncTransactions)) {
        const k = key;
        const v = value;
        v.forEach(record => {
            if (record.restpoint == 'paragon') {
                results.paragon.total++;
                results.paragon.items.push({ key: k, value: record, expiring: calcExpirationTs(record.ts) });
                if (record.inprogress) results.paragon.inprogress++;
                else if (record.stat != null) {
                    results.paragon.success = results.paragon.success + (record.stat.ok ? 1 : 0);
                    results.paragon.failed = results.paragon.failed + (record.stat.ok ? 0 : 1);
                }
            }
            else if (record.restpoint == 'faktura') {
                results.faktura.total++;
                results.faktura.items.push({ key: k, value: record, expiring: calcExpirationTs(record.ts) });
                if (record.inprogress) results.faktura.inprogress++;
                else if (record.stat != null)  {
                    results.faktura.success = results.faktura.success + (record.stat.ok ? 1 : 0);
                    results.faktura.failed = results.faktura.failed + (record.stat.ok ? 0 : 1);
                }
            }
            else if (record.restpoint == 'command') {
                results.command.total++;
                results.command.items.push({ key: k, value: record, expiring: calcExpirationTs(record.ts) });
                if (record.inprogress) results.command.inprogress++;
                else if (record.stat != null)  {
                    results.command.success = results.command.success + (record.stat.ok ? 1 : 0);
                    results.command.failed = results.command.failed + (record.stat.ok ? 0 : 1);
                }
            }
        })

    }

    return results;
}


function scheduleQueueCleaner() {

    logger.logger.info(`Scheduling queue cleaner with retention of ${config.queue.retention} ms`);
    setInterval(function () {

        const currentts = new Date().getTime();
        const retention = config.queue.retention;

        for (const [key, value] of Object.entries(asyncTransactions)) {
            var newvalue = [];
            value.forEach((item) => {
                var retention_offset = item.ts + retention;
                if (retention_offset < currentts && item.inprogress == false) {    //jelsi minelo 5 minut oraz inprogress jets na false
                    logger.logger.debug(`Removing expired item from the queue: ${item}`);
                } else {
                    newvalue.push(item);
                }
            });

            asyncTransactions[key] = newvalue;
            if (newvalue.length == 0) {
                delete asyncTransactions[key];
            }
        }

    }, 2000);
}

function init() {
    //schedule asyncTransactions queue cleaner
    scheduleQueueCleaner();

}
    
module.exports.init = init;
module.exports.executeTask = executeTask;
module.exports.calculateTransactionsResult = calculateTransactionsResult;
module.exports.createTransaction = createTransaction;
module.exports.retryTransaction = retryTransaction;
