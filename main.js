"use strict;"

const yaml = require('js-yaml');
const fs = require('fs');
const uploadProtocols = require('./upload');
const yargs = require('yargs');

//define the commandline arguments with the yargs library
const argv = yargs.usage('Labor Api Client\n\nUsage: $0 [options] [protocol files...]')
    .version()
    .help('help').alias('help','h')
    .option('config', {
        alias: 'c' ,
        describe: '/path/to/config.yaml Configuration file in YAML Format',
    })
    .argv;

//load the config.yaml
//specifiy the default config
let config = {
    apiURL: 'http://localhost:3000/',
    apiImageEndpoint:'image/',
    apiProtocolEndpoint: 'protocol/',
    imageBasePath: 'images/'
};
if(argv.config){
    try{
        //parse the yaml file
        const parsed_config = yaml.safeLoad(fs.readFileSync(argv.config));
        //merge with the default config
        //note that we unwrap the top level yaml object
        //with parsed_config.config
        Object.assign(config, parsed_config.config);
    }
    catch(e){
        console.error("an error occured while reading the specified configuration file");
        console.error(error);
    }

}
//log the config to the user
console.log("config: ");
console.log(JSON.stringify(config, null, '\t'));


//load all specified protocol files
let protocols = [];
try{
    //argv._ holds all non-hyphenated arguments
    for(let input of argv._){
        const parsed = yaml.safeLoad(fs.readFileSync(input));
        //remove the top level yaml object
        //which is named 'protocol' to make
        //the yaml file look prettier
        protocols.push(parsed.protocol);
    }
} catch(e){
    console.error("an error occured while reading the specified protocols:");
    console.error(e);
}

//try inserting the protocols
uploadProtocols(protocols, config)
    .then((protocol) => console.log("success"))
    .catch(error => console.error(error));



