"use strict;"
//imports
const axios = require('axios');
//
//protocol add subcommand for la-cli
module.exports.commands = 'delete <id>'
//provide a description
module.exports.description = "delete a protocol with the given id"
//provide a builder function which
//sets the usage since is not done automatically for some reason
module.exports.builder = (yargs) => yargs.usage("Delete a protocol with the given id:\n\nUsage: $0 protocol delete <id>");
//provide a handler function which is called when this subcommand gets executed
module.exports.handler = (argv) => {
    //id is in argv.id
    deleteProtocol(argv.id)
        .then(() => console.log(`protocol with ID: ${argv.id} succesfully deleted`))
        .catch((error) => console.error(`error deleting protocol:\n ${error}`));
}

/** Deletes a protocol with the given id
 * @param id The protocol id to delete
 */
async function deleteProtocol(id){
    let res = axios.delete(argv.apiURL + argv.apiProtocolEndpoint, {
        params: { id: id }
    });
    if(res.status != 200) throw new Error(`strange response from server: ${JSON.stringify(res, null, '  ')}`);
}
