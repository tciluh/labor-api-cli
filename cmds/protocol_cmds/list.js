"use strict;"
//imports
const axios = require('axios');
const Table = require('cli-table2');
module.exports.command = 'list'
//provide a description
module.exports.describe = 'list all protocols available'
//provide a builder function which
//sets the usage since is not done automatically for some reason
module.exports.builder = (yargs) => yargs.usage('List all protocols available.');
//provide a handler function which is called when this subcommand gets executed
let api;
module.exports.handler = (argv) => {
    //init axios api instance
    api = axios.create({
        baseURL: argv.development ? argv.developmentAPI : argv.productionAPI 
    });
    log.info(`listing all protocols available at: ${api.defaults.baseURL}`);
    listProtocols(argv)
        .then((count) => log.info(`listed ${count} protocols`))
        .catch(error => log.error(`error getting protocols:\n`, error));
}

/** List all Protocols 
 */
async function listProtocols(argv){
    let res = await api.get(argv.apiProtocolEndpoint)
    if(res.status != 200) throw new Error(`api returned unexpected status code: ${res.status}`);
    if(!res.data.success || !res.data.payload) {
        throw new Error(`api call successful but api returned an error: `, res.data);
    }
    const count = res.data.payload.length;
    const protocols = res.data.payload;
    if(count > 0) {
        const table = new Table({
            head: ['id', 'name', 'description', 'instruction count'],
        })
        protocols.forEach((proto) => {
            table.push([proto.id.toString(), proto.name, proto.description, proto.instructions.length.toString()]);
        })
        console.log(table.toString());
    }
    return count;
}
