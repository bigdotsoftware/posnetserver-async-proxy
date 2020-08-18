'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const logger = require('./logger');
const http = require('http');
const https = require('https');

const fs = require("fs");

const tasks_manager = require('./tasks_manager');
const yaml_config = require('node-yaml-config');


//###################################################
//                  Config
//###################################################
var buildVersion = null;
var config = yaml_config.load(__dirname + '/config.yml');



//###################################################
//                  Methods
//###################################################

const app = express();

app.use(bodyParser.json({ limit: '3mb' }));

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

var api_definition = {
    "/paragon": {
        method: 'post',
        func: (req, res) => { processPosnetServerCommand("paragon", req, res); }
    },
    "/faktura": {
        method: 'post',
        func: (req, res) => { processPosnetServerCommand("faktura", req, res); }
    },
    "/command": {
        method: 'post',
        func: (req, res) => { processPosnetServerCommand("command", req, res); }
    },
    "/async_queue": {
        method: 'get',
        attributes: [
            { attribute: 'pretty', description: 'true/false', default: 'false' }
        ],
        func: (req, res) => { processAsyncQueue(req, res); }
    },
    "/async_queue/summary": {
        method: 'get',
        attributes: [
            { attribute: 'pretty', description: 'true/false', default: 'false' }
        ],
        func: (req, res) => { processAsyncQueueSummary(req, res); }
    },
    "/async_queue/retry/:transactionUUID": {
        method: 'get',
        func: (req, res) => { processAsyncQueueRetry(req, res); }
    },
    "/": {
        method: 'get',
        func: (req, res) => { processRootRestApi(req, res); }
    }
}

function getProtocol(req) {
    var proto = req.connection.encrypted ? 'https' : 'http';
    proto = req.headers['x-forwarded-proto'] || proto;
    return proto.split(/\s*,\s*/)[0];
}

function initOtherOptions(other_options) {
    buildVersion = other_options.buildVersion;
}

function initApiDefinitions(def) {
    for (const [key, value] of Object.entries(def)) {
        if (value.method == 'get')
            app.get(key, value.func);
        else if (value.method == 'put')
            app.put(key, value.func);
        else if (value.method == 'post')
            app.post(key, value.func);
        else if (value.method == 'delete')
            app.delete(key, value.func);
        else
            logger.logger.error('Unrecognized method: ' + value.method);
    }
}



function processRootRestApi(req, res) {
    var restpoints = [
        { groupname: 'Informacja ogolna' },
        { type: 'GET', name: '' },
        { groupname: 'Operacje na kolejce' },
        { ref: '/async_queue' },
        { ref: '/async_queue/summary' },
        { ref: '/async_queue/retry/:transactionUUID' },
        { groupname: 'Metody PosnetServer\'a dostepne w proxy' }
    ];

    for (const [key, value] of Object.entries(api_definition)) {
        if (key != "/" && key.startsWith("/async_queue") == false )
            restpoints.push({ type: value.method.toUpperCase(), name: key.substr(1) });
    }

    var restpointsstring = '';
    restpoints.forEach(rp => {
        if (rp.groupname != null) {
            restpointsstring += '<br>\n<b>' + rp.groupname + '</b><br>\n';
        } else if (rp.ref != null) {
            restpointsstring += api_definition[rp.ref].method.toUpperCase().padEnd(6, ' ').replace(/ /g, '&nbsp;') + ' ' + getProtocol(req) + '://' + req.headers.host + '/' + rp.ref.substr(1) + '  <br>\n';
            if (api_definition[rp.ref].attributes != null && api_definition[rp.ref].attributes.length > 0) {
                api_definition[rp.ref].attributes.forEach(att => {
                    restpointsstring += '       '.replace(/ /g, '&nbsp;') + ' ?' + att.attribute + ' = ' + att.description + ' (default: ' + att.default + ')  <br>\n';
                });
            }
        } else {
            restpointsstring += rp.type.padEnd(6, ' ').replace(/ /g, '&nbsp;') + ' ' + getProtocol(req) + '://' + req.headers.host + '/' + rp.name + '  <br>\n';
        }
    });


    var results = tasks_manager.calculateTransactionsResult();
    var queuestring =
        '         In progress Success Failed Total <br>\n' +
        `Faktura: ${results.faktura.inprogress.toString().padStart(11, ' ')} ${results.faktura.success.toString().padStart(11, ' ')} ${results.faktura.failed.toString().padStart(11, ' ')} ${results.faktura.total} <br>\n` +
        `Paragon: ${results.paragon.inprogress.toString().padStart(11, ' ')} ${results.paragon.success.toString().padStart(11, ' ')} ${results.paragon.failed.toString().padStart(11, ' ')} ${results.paragon.total} <br>\n` +
        `Command: ${results.command.inprogress.toString().padStart(11, ' ')} ${results.command.success.toString().padStart(11, ' ')} ${results.command.failed.toString().padStart(11, ' ')} ${results.command.total} <br>\n`;

    res.send('Async Proxy for Posnet Server v.' + buildVersion + ' © 2020 BigDotSoftware (bigdotsoftware@bigdotsoftware.pl). <br>\n' +
        'Jak zaczac: https://blog.bigdotsoftware.pl/posnet-server-pierwsze-uzycie/ <br>\n<br>\n' +
        'Stan kolejki: <br><tt>\n' +
        queuestring + 
        '</tt><br><br>' + 
        'API: <br><tt>\n' +
        restpointsstring + 
        '</tt>'
    );
}

function processPosnetServerCommand(restpoint, req, res)
{
    const transactionUUID = tasks_manager.createTransaction(restpoint, req.body);
    res.json({ ok: true, transactionUUID: transactionUUID });

    tasks_manager.executeTask(transactionUUID, config.fulldebug);
}

function processAsyncQueueRetry(req, res) {
    const transactionUUID = tasks_manager.retryTransaction(req.params.transactionUUID);
    res.json({ ok: true, transactionUUID: transactionUUID });

    tasks_manager.executeTask(transactionUUID, config.fulldebug);
}

function isPrettyOutput(req) {
    return req.query != null && req.query.pretty;
}
function prettyJson(obj) {
    return '<tt>' + JSON.stringify(obj, null, 2).replace(/\n/g, "<br/>").replace(/ /g, "&nbsp;") + '</tt>';
}
function sendResponse(req, res, results) {
    if (isPrettyOutput(req))
        return res.send(prettyJson({
            ok: true,
            faktura: results.faktura,
            paragon: results.paragon,
            command: results.command
        }));
    else
        return res.json({
            ok: true,
            faktura: results.faktura,
            paragon: results.paragon,
            command: results.command
        });
}

function processAsyncQueue(req, res) {

    var results = tasks_manager.calculateTransactionsResult();

    return sendResponse(req, res, results);
};




function processAsyncQueueSummary(req, res) {

    var results = tasks_manager.calculateTransactionsResult();

    return sendResponse(req, res, {
        ok: true,
        faktura: {
            inprogress: results.faktura.inprogress,
            success: results.faktura.success,
            failed: results.faktura.failed,
            total: results.faktura.total
        },
        paragon: {
            inprogress: results.paragon.inprogress,
            success: results.paragon.success,
            failed: results.paragon.failed,
            total: results.paragon.total
        },
        command: {
            inprogress: results.command.inprogress,
            success: results.command.success,
            failed: results.command.failed,
            total: results.command.total
        }
    });
};




function init(http_options, https_options, other_options) {

    initApiDefinitions(api_definition);
    initOtherOptions(other_options);

    logger.logger.info(`Trying to open HTTP on port: ${http_options.port}`);
    try {
        var server = http.createServer(app);
        server.on('error', function (e) {
            logger.logger.error(`Cannot start HTTP at http://localhost: ${http_options.port}, please check if there no another process listening on the same port. Reason: ${e}`);
        });
        server.listen(http_options.port);
        logger.logger.info('HTTP  at http://localhost:' + http_options.port)
    } catch (e) {
        logger.logger.error(`Cannot start HTTP at http://localhost:' ${http_options.port}, please check if there no another process listening on the same port. Reason: ${e}`);
    }


    if (https_options.active) {
        logger.logger.info(`Loading SSL certs...: ${https_options.sslcertificates.key}`);
        var options = null;
        try {
            options = {
                key: fs.readFileSync(https_options.sslcertificates.key),
                cert: fs.readFileSync(https_options.sslcertificates.crt)
            };
        } catch (e) {
            logger.logger.error(`Cannot load certificates ${https_options.sslcertificates.key} and ${https_options.sslcertificates.crt}. Reason: ${e}`);
        }

        if (options != null) {
            logger.logger.info(`Trying to open HTTPS on port: ${https_options.port}`);
            try {
                https.createServer(options, app).listen(https_options.port);
                logger.logger.info(`HTTPS at https://localhost: ${https_options.port}`);
            } catch (e) {
                logger.logger.error(`Cannot start HTTPS at https://localhost: ${https_options.port}, please check your certificate under the ./cert directory. Reason: ${e}`);
            }
        }
    } else {
        logger.logger.info('HTTPS is disabled in configuration. To enable set https.active=true in config.yml');
    }

}

module.exports.init = init;
