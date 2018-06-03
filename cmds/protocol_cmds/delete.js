'use strict;'
// imports
const axios = require('axios')
//
// protocol add subcommand for la-cli
module.exports.command = 'delete <id>'
// provide a description
module.exports.describe = 'delete a protocol with the given id'
// provide a builder function which
// sets the usage since is not done automatically for some reason
module.exports.builder = (yargs) => yargs.usage('Delete a protocol with the given id:\n\nUsage: $0 protocol delete <id>')
// provide a handler function which is called when this subcommand gets executed
let api
module.exports.handler = (argv) => {
    // init axios api instance
    api = axios.create({
        baseURL: argv.dev ? argv.developmentAPI : argv.productionAPI
    })
    // id is in argv.id
    log.info(`deleting protocol with id: ${argv.id}`)
    if (!argv.id || Number.isNaN(argv.id) || !Number.isFinite(argv.id)) {
        log.error(`${argv.id} is not a valid protocol id]`)
    }
    const id = Number.parseInt(argv.id)
    deleteProtocol(id, argv)
        .then(() => log.info(`protocol with ID: ${id} succesfully deleted`))
        .catch(error => log.error(`error deleting protocol:\n`, error))
}

/** Deletes a protocol with the given id
 * @param id The protocol id to delete
 */
async function deleteProtocol (id, argv) {
    let res = await api.delete(`${argv.apiProtocolEndpoint}${id}`)
    if (res.status !== 200) throw new Error(`strange response from server: ${JSON.stringify(res, null, '  ')}`)
}
