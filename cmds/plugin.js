'use strict;'

module.exports.command = 'plugin <command>'
module.exports.describe = 'do something with a labor-api IO plugin'
// provide a custom builder function which adds the subcommands from the protocol_cmds directory
// this is done via the yargs commandDir function.
// see https://github.com/yargs/yargs/blob/master/docs/advanced.md#commands
module.exports.builder = (yargs) => {
    yargs.usage('Commands for labor-api IO Plugins:\n\nUsage: $0 plugin <command>')
    return yargs.commandDir('plugin_cmds')
}
// provide the user with an error if he tries to use the protocol command without an subcommand
module.exports.handler = (argv) => {
    console.error('more arguments needed')
}
