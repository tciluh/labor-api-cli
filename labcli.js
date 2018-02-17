#!/usr/bin/env node
"use strict;"

const yaml = require('js-yaml');
const fs = require('fs');
const yargs = require('yargs');

//specifiy the default config
const defaultConfig = {
    apiURL: 'http://localhost:3000/',
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
    .commandDir('cmds')
    .demandCommand()
    .argv;
