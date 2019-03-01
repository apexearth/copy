#!/usr/bin/env node

const fs          = require('fs')
const path        = require('path')
const {promisify} = require('util')
const readdir     = promisify(fs.readdir)
const copyFile    = promisify(fs.copyFile)
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
        state
    } = {}) {
        this.from         = from
        this.to           = to
        this.recursive    = recursive
        this.overwrite    = overwrite
        this.verbose      = verbose
        this.ignoreErrors = ignoreErrors
        this.parallelJobs = parallelJobs
        this.state        = state || `node-copy_${(from + '_' + to).replace(/[/\\]/g, '')}.state`

        this.pending = []
        this.errors  = []
        this.counts  = {
            directories: 0,
            files      : 0
        }
    }

    async start() {
        await this.copy(this.from, this.to)
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
            this.counts.directories++
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
            this.counts.files++
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
            process.stdout.write(`Count: ${this.counts.directories}d ${this.counts.files}f `)
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
        .option('-s, --state [state]', 'Save state for resume ability.')
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
