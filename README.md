
# Async Proxy for Posnet Server
[![Known Vulnerabilities](https://snyk.io/test/github/bigdotsoftware/posnetserver-async-proxy/badge.svg?style=flat-square&maxAge=2592000)](https://snyk.io/test/github/bigdotsoftware/posnetserver-async-proxy)

This is simple multi-threading node.js queue implementation to asynchronously process fiscal printouts.
https://blog.bigdotsoftware.pl/posnet-server-pierwsze-uzycie/

## Overview

This service listen on port 3060 and forward requests (/paragon, /command and /faktura) into PosnetServer. Full information about available RESTpoints can be listed by executing [http://localhost:3060/](http://localhost:3060/)

## Installation

This service has to be installed via npm:

```
git clone https://github.com/bigdotsoftware/posnetserver-async-proxy.git
cd posnetserver-async-proxy
npm install
```
## Configuration

Configuration file is config.yml. Sample configuration
```
default:
  http:
    port: 3060
  https:
    active: false
    port: 3061
    sslcertificates:
      key: "./cert/server.key"
      crt: "./cert/server.crt"
  posnetserver:
    baseurl: "http://localhost:3050"
    retry:
      interval: 7000    # 7 seconds
      times: 5          # retry up to 5 times
  queue:
    retention: 1800000  # 30 minutes
  logging:
    fulldebug: true
```


| group | parameter | description |
|--|--|--|
| http | port|  Port to listen for incoming requests (HTTP)|
| https|active|  HTTPS enabled/disabled|
| https|port|  Port to listen for incoming requests (HTTPS)|
| https|sslcertificates|  key and certificate for HTTPS|
| posnetserver|baseurl|  PosnetServer RESTful API|
| posnetserver|retry| How many times and how long to wait before next communication attempt with PosnetServer (in case of connection issues)|
| queue|retention| How long to keep requests in the queue (queue **is not persistent**; means that requests in the queue won't survive service restart)|
| logging|fulldebug| Additional flag to enable detailed logging mode|

## Run

This service has to be run via npm:

```
npm start
```