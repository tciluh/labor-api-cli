"use strict;"
//imports
const axios = require('axios');
//
//protocol add subcommand for la-cli
module.exports.command = 'delete <id>'
//provide a description
module.exports.describe = "delete a protocol with the given id"
//provide a builder function which
//sets the usage since is not done automatically for some reason
module.exports.builder = (yargs) => yargs.usage("Delete a protocol with the given id:\n\nUsage: $0 protocol delete <id>");
//provide a handler function which is called when this subcommand gets executed
let api;
module.exports.handler = (argv) => {
    //init axios api instance
    api = axios.create({
        baseURL: config.development ? config.developmentAPI : config.productionAPI 
    });
    //id is in argv.id
    deleteProtocol(argv.id, argv)
        .then(() => console.log(`protocol with ID: ${argv.id} succesfully deleted`))
        .catch((error) => console.error(`error deleting protocol:\n ${error}`));
}

/** Deletes a protocol with the given id
 * @param id The protocol id to delete
 */
async function deleteProtocol(id, argv){
    let res = await api.delete(argv.apiProtocolEndpoint, {
        params: { id: id }
    });
    if(res.status != 200) throw new Error(`strange response from server: ${JSON.stringify(res, null, '  ')}`);
}
