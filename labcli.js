#!/usr/bin/env node
'use strict;'

const yaml = require('js-yaml')
const fs = require('fs')
const yargs = require('yargs')
const Winston = require('winston')
global.log = new (Winston.Logger)({
    transports: [
        new (Winston.transports.Console)({
            level: 'info',
            colorize: true
        }),
        new (Winston.transports.File)({
            filename: 'labcli.log',
            level: 'debug',
            handleExceptions: true,
            humanReadableUnhandledException: true
        })
    ]
})

// define the commandline arguments with the yargs library
// eslint-disable-next-line no-unused-vars
const argv = yargs.usage('Labor Api Client\n\nUsage: $0 [options] [command] [command options...]')
    .version()
    .help('help').alias('help', 'h')
    .option('dev', {
        alias: 'd' ,
        default: false,
        type: 'boolean',
        describe: 'enable developer mode'
    })
    .option('developmentAPI', {
        default: 'http://localhost:3000',
        type: 'string',
        describe: 'The API url to use when in developer mode'
    })
    .option('productionAPI', {
        default: 'http://130.75.115.47:3000/',
        type: 'string',
        describe: 'The API url to use when not in developer mode'
    })
    .option('apiImageEndpoint', {
        default: 'image/',
        type: 'string',
        describe: 'The route at which images can be added to the API'
    })
    .option('apiProtocolEndpoint', {
        default: 'protocol/',
        type: 'string',
        describe: 'The route at which protocols can be added to the API'
    })
    .option('imageBasePath', {
        default: 'images/',
        type: 'string',
        describe: 'The relative path which is searched for the specified images'
    })
    .option('defaultImageExtension', {
        default: 'png',
        type: 'string',
        describe: 'The image extension which will be assumed for pictures'
    })
    .config('config', 'Path to custom config.yml', (path) => {
        return yaml.safeLoad(fs.readFileSync(path, 'utf-8'))
    })
    .commandDir('cmds')
    .demandCommand()
    .argv
