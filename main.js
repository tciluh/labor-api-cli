"use strict;"

let yaml = require('js-yaml');
let fs = require('fs');

try{
    let doc = yaml.safeLoad(fs.readFileSync('./protocol.yaml'));
    console.log(JSON.stringify(doc,null,'\t'));
} catch(e){
    console.error(e);
}

