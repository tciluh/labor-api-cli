#!/usr/bin/env node
"use strict;"

const yaml = require('js-yaml');
const fs = require('fs');
const yargs = require('yargs');
const Winston = require('winston');
global.log = new (Winston.Logger) ({
       transports: [
           new (Winston.transports.Console)(),
           new (Winston.transports.File) ({ 
               filename: 'labcli.log', 
               handleExceptions: true,
               humanReadableUnhandledException: true
           })
       ]
});

//specifiy the default config
const defaultConfig = {
    development: false,
    developmentAPI:'http://localhost:3000/',
    productionAPI: 'http://130.75.115.47:3000/',
    apiImageEndpoint:'image/',
    apiProtocolEndpoint: 'protocol/',
    imageBasePath: 'images/',
    defaultImageExtension: 'png',
}

//define the commandline arguments with the yargs library
const argv = yargs
    .usage('Labor Api Client\n\nUsage: $0 [options] [command] [command options...]')
    .version()
    .help('help').alias('help','h')
    .defaults(defaultConfig)
    .config('config', 'Path to custom config.yml', (path) => {
        return yaml.safeLoad(fs.readFileSync(path, 'utf-8'));
    })
    .alias('development', 'd')
    .help('development', 'Enable Developer Mode')
    .commandDir('cmds')
    .demandCommand()
    .argv;
