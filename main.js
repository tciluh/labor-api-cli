"use strict;"

const yaml = require('js-yaml');
const fs = require('fs');
const yargs = require('yargs');

//specifiy the default config
const defaultConfig = {
    apiURL: 'http://localhost:3000/',
    apiImageEndpoint:'image/',
    apiProtocolEndpoint: 'protocol/',
    imageBasePath: 'images/'
}

//define the commandline arguments with the yargs library
const argv = yargs
    .usage('Labor Api Client\n\nUsage: $0 [options] [command] [command options...]')
    .version()
    .help('help').alias('help','h')
    .defaults(defaultConfig)
    .config('config', 'Path to custom config.yaml', (path) => {
        console.log("inside parser");
        const json = yaml.safeLoad(fs.readFileSync(path));
        console.log(json);
        return yaml.safeLoad(fs.readFileSync(path, 'utf-8'));
    })
    .commandDir('cmds')
    .demandCommand()
    .argv;

//log the config to the user
console.log("config: ");
console.log(JSON.stringify(argv, null, '\t'));


