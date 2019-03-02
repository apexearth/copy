#!/usr/bin/env node

const {version} = require('./package.json')
const program   = require('commander')
const {Copy}    = require('./index')

program
    .version(version)
    .arguments('<from> <to>')
    .option('-r, --recursive', 'Copy recursively.')
    .option('-o, --overwrite', 'Overwrite existing.')
    .option('-v, --verbose', 'Verbose output.')
    .option('-e, --ignore-errors', 'Ignore errors.')
    .option('-p, --parallel-jobs <n>', 'Number of possible concurrent jobs.', 1)
    .option('-s, --state <file>', 'Save state to file for resume ability.')
    .option('--state-frequency <n>', 'Save state frequency. (In <n> files saved.)', 100)
    .action((from, to) => {
        program.from           = from
        program.to             = to
        program.parallelJobs   = parseInt(program.parallelJobs)
        program.stateFrequency = parseInt(program.stateFrequency)
        const copy             = new Copy(program)
        copy.start().catch(err => {
            console.error(err)
            process.exit(1)
        })
    })
    .parse(process.argv)