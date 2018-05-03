'use strict;'
// imports
const io = require('socket.io-client')
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
    
    let resultsPending = []
    const api = argv.development ? argv.developmentAPI : argv.productionAPI
    socket = io(api, {
        timeout: 2000
    })

    socket.on('action error', (error) => {
        if(error && error.error && error.actionId) {
            log.error(`action ${error.actionId} (rid = ${error.resultId}) error: `, error.error)
            if(error.resultId) {
                resultsPending = resultsPending.filter(elem => elem.resultId !== error.resultId)
                if(resultsPending.length === 0) {
                    log.info('finished testing.')
                    socket.close()
                }
            }
        }
        else {
            log.error('an undefined action has thrown an undefined error') 
            socket.close()
        }
    })
    socket.on('result', (answer) => {
        const obj = resultsPending.find((elem) => elem.resultId === answer.id);
        log.warn(`action ${obj.actionId} (rid = ${obj.resultId}) result : `, answer.result)
        resultsPending = resultsPending.filter((elem) => elem.resultId !== answer.id)
        if(resultsPending.length === 0) {
            log.info('finished testing.')
            socket.close()
        }
    })
    socket.on('error', (msg) => {
        log.error(`socket.io error: `, msg)
    })

    socket.on('connect_error', (error) => {
        log.warn(`error while connecting to socket.io@${api}: `, error) 
    })

    socket.on('connect', () => {
        log.info(`connected to socket.io@${api}`)
        for(const id of argv.ids)  {
            socket.emit('action', id, (resultid) => {
                log.debug(`action ${id} -> result ${resultid}`)
                resultsPending.push({ resultId: resultid, actionId: id })
            })
        }
    })
    socket.on('disconnect', () => {
        log.info(`disconnected from socket.io@${api}`)
    })

    socket.open()
}

