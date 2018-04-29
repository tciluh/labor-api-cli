'use strict;'
// imports
import 'io' from 'socket.io-client'
let socket

module.exports.command = 'test <ids...>'
// provide a description
module.exports.describe = 'test one or more plugins with the provided action ids'
// provide a builder function which
// sets the usage since is not done automatically for some reason
module.exports.builder = (yargs) => yargs.usage('Test plugin with provided action ids.')
// provide a handler function which is called when this subcommand gets executed
module.exports.handler = (argv) => {
    log.info('trying to test plugins')
    log.info(`got ${argv.ids.length} ids.`)
    argv.ids.forEach(id => log.verbose(`- ${id}`))
    
    let finished = false
    let resultsPending = []
    const api = argv.development ? argv.developmentAPI : argv.productionAPI
    socket = io(api)
    socket.on('action error', (error) => {
        log.error(`got error while executing an action:\n`)
        log.error(error)
        finished = true
    })
    socket.on('result', (answer) => {
        log.info(`got result:\n`, answer)
        resultsPending = resultsPending.filter((elem) => elem != answer.id)
        if(resultsPending.length === 0) finished = true
    })
    socket.on('error', (msg) => {
        log.error(`got error from socket.io:\n`)
        log.error(error)
        finished = true
    })
    socket.on('connection', () => {
        log.info(`connected to socket.io@${api}`)
        for(const id of argv.ids)  {
            socket.emit('action', id, (resultid) => {
                resultsPending.push(resultid)
            })
        }
    })
    socket.on('disconnect', () => {
        log.info(`disconnected from socket.io@${api}`)
        finished = true;
    })

    while(!finished) {
        //do nothing 
    }
}

