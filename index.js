#!/usr/bin/env node

const fs          = require('fs')
const path        = require('path')
const {promisify} = require('util')
const readdir     = promisify(fs.readdir)
const copyFile    = promisify(fs.copyFile)
const readFile    = promisify(fs.readFile)
const writeFile   = promisify(fs.writeFile)
const stat        = promisify(fs.stat)
const mkdir       = promisify(fs.mkdir)
const program     = require('commander')
const pretty      = require('prettysize')
const sleep       = require('sleep-promise')
const {version}   = require('./package.json')

/**
 * @param {string} from - Source copy path.
 * @param {string} to - Destination copy path.
 * @param {boolean} recursive - Copy recursively.
 * @param {boolean} overwrite - Overwrite existing files.
 * @param {boolean} verbose - Verbose output.
 * @param {boolean} ignoreErrors - Continue on errors.
 * @param {boolean} parallelJobs - Number of possible concurrent jobs.
 * @param {string} state - Save state for resume ability.
 * @param {string} stateFrequency - Save state frequency.
 */
class Copy {
    constructor({
        from,
        to,
        recursive = false,
        overwrite = false,
        verbose = false,
        ignoreErrors = false,
        parallelJobs = 1,
        state,
        stateFrequency = 100
    } = {}) {
        this.from           = from
        this.to             = to
        this.recursive      = recursive
        this.overwrite      = overwrite
        this.verbose        = verbose
        this.ignoreErrors   = ignoreErrors
        this.parallelJobs   = parallelJobs
        this.stateFile      = state
        this.stateFrequency = stateFrequency

        this.stateCatchUp = false // Set true when we need to catch up to our saved state.
        this.state        = {
            lastFile: null,
            counts  : {
                directories: 0,
                files      : 0
            },
        }

        this.pending = []
        this.errors  = []
    }

    async start() {
        await this.loadState()
        await this.copy(this.from, this.to)
    }

    async loadState() {
        if (!this.stateFile) return
        try {
            await stat(this.stateFile)
            this.state        = JSON.parse(await readFile(this.stateFile))
            this.stateCatchUp = true
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err
            }
        }
    }

    async saveState() {
        if (!this.stateFile) return
        await writeFile(this.stateFile, JSON.stringify(this.state))
    }

    async processJobErrors() {
        let err = this.errors.unshift()
        while (err) {
            if (this.ignoreErrors) {
                console.error(err)
            } else {
                throw err
            }
            err = this.errors.unshift()
        }
    }

    async copy(from, to) {
        if (this.stateCatchUp && !this.state.lastFile.startsWith(from)) return
        if (this.stateCatchUp && this.state.lastFile === from) {
            this.stateCatchUp = false // We're caught up -- yay!
        }
        try {
            const s           = await stat(from)
            const isDirectory = s.isDirectory()
            if (isDirectory && this.recursive) {
                await this.copyDirectory(from, to)
            } else if (!isDirectory) {
                this.fromSize = s.size
                await this.queueAction(() => this.copyFile(from, to))
            }
            await this.processJobErrors()
        } catch (err) {
            if (this.ignoreErrors) {
                console.error(err)
            } else {
                throw err
            }
        }
    }

    async copyDirectory(from, to) {
        try {
            try {
                await stat(to)
            } catch (err) {
                if (err.code === 'ENOENT') {
                    await mkdir(to)
                } else {
                    throw err
                }
            }
            const files = await readdir(from)
            for (let file of files) {
                await this.copy(path.join(from, file), path.join(to, file))
            }
        } catch (err) {
            if (this.ignoreErrors) {
                console.error(err)
            } else {
                throw err
            }
        } finally {
            this.state.counts.directories++
        }
    }

    async queueAction(asyncFunction) {
        while (this.pending.length >= this.parallelJobs) {
            await sleep(10)
        }
        const action = async () => {
            try {
                await asyncFunction()
            } finally {
                this.pending.splice(this.pending.indexOf(asyncFunction), 1)
            }
        }
        this.pending.push(action)
        action().catch(err => this.errors.push(err))
    }

    async copyFile(from, to) {
        try {
            if (this.verbose) {
                this.log(`Copying: '${to}' (start)`)
            }
            try {
                await stat(to)
                if (this.overwrite) {
                    await this.doCopy(from, to)
                } else {
                    if (this.verbose) {
                        this.log(`Copying: '${to}' (skipped)`)
                    }
                }
            } catch (err) {
                if (err.code === 'ENOENT') {
                    await this.doCopy(from, to)
                } else {
                    throw err
                }
            }
        } catch (err) {
            if (this.ignoreErrors) {
                console.error(err)
            } else {
                throw err
            }
        } finally {
            this.state.lastFile = from
            if (this.state.counts.files % this.stateFrequency === 0) {
                await this.saveState()
            }
        }
    }

    async doCopy(from, to) {
        try {
            if (this.verbose) {
                const start = Date.now()
                await copyFile(from, to)
                const speed = pretty(this.fromSize / ((Date.now() - start) / 1000))
                this.log(`Copying: '${to}' (complete) (${speed}/s)`)
            } else {
                await copyFile(from, to)
            }
            this.state.counts.files++
        } catch (err) {
            if (this.ignoreErrors) {
                this.log(`Copying: '${to}' (error)`)
                console.error(err)
            } else {
                throw err
            }
        }
    }

    log(message) {
        if (this.verbose) {
            process.stdout.write(`Count: ${this.state.counts.directories}d ${this.state.counts.files}f `)
            console.log(`Jobs: ${this.pending.length} ${message}`)
        }
    }
}

module.exports      = options => {
    const copy = new Copy(options)
    return copy.start()
}
module.exports.Copy = Copy

if (require.main === module) {
    program
        .version(version)
        .arguments('<from> <to>')
        .option('-r, --recursive', 'Copy recursively.')
        .option('-o, --overwrite', 'Overwrite existing.')
        .option('-v, --verbose', 'Verbose output.')
        .option('-e, --ignore-errors', 'Ignore errors.')
        .option('-p, --parallel-jobs <n>', 'Number of possible concurrent jobs.')
        .option('-s, --state <file>', 'Save state to file for resume ability.')
        .option('--state-frequency <n>', 'Save state frequency. (In <n> files saved.)')
        .action((from, to) => {
            (async () => {
                program.from = from
                program.to   = to
                const copy   = new Copy(program)
                try {
                    await copy.start()
                } catch (err) {
                    console.error(err)
                    process.exit(1)
                }
            })()
        })
        .parse(process.argv)
}
