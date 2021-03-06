'use strict;'

// protocol subcommand for la-cli
// we support a protocol command which expects another sub command
module.exports.command = 'protocol <command>'
// provide a description
module.exports.describe = 'do something with a protocol'
// provide a custom builder function which adds the subcommands from the protocol_cmds directory
// this is done via the yargs commandDir function.
// see https://github.com/yargs/yargs/blob/master/docs/advanced.md#commands
module.exports.builder = (yargs) => {
    yargs.usage('Do something with protocols:\n\nUsage: $0 protocol <command>')
    return yargs.commandDir('protocol_cmds')
}
// provide the user with an error if he tries to use the protocol command without an subcommand
module.exports.handler = (argv) => {
    console.error('protocol command without subcommand is not supported')
}
