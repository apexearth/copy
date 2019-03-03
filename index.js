const fs          = require('fs')
const path        = require('path')
const {promisify} = require('util')
const readFile    = promisify(fs.readFile)
const writeFile   = promisify(fs.writeFile)
const mkdir       = promisify(fs.mkdir)
const mkdirp      = promisify(require('mkdirp'))
const pretty      = require('prettysize')
const sleep       = require('sleep-promise')
const assert      = require('assert')

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
 * @param {string} copyFile - Supply your own copyFile function. (from, to, cb)
 * @param {string} readdir - Supply your own readdir function. (path, cb)
 */
class Copy {
    constructor(options = {}) {
        this.from           = options.from
        this.to             = options.to
        this.recursive      = options.recursive || false
        this.overwrite      = options.overwrite || false
        this.verbose        = options.verbose || false
        this.ignoreErrors   = options.ignoreErrors || false
        this.parallelJobs   = options.parallelJobs || 1
        this.stateFile      = options.state
        this.stateFrequency = options.stateFrequency || 100
        this.fns            = {
            stat    : promisify(options.stat || fs.stat),
            readdir : promisify(options.readdir || fs.readdir),
            copyFile: promisify(options.copyFile || fs.copyFile),
        }
        this.stateCatchUp   = false // Set true when we need to catch up to our saved state.
        this.state          = {
            lastFile: null,
            counts  : {
                directories: 0,
                files      : 0
            },
        }

        this.pending = []
        this.errors  = []

        assert.equal(typeof this.from, 'string', 'from should be a string')
        assert.equal(typeof this.to, 'string', 'to should be a string')
        assert.equal(typeof this.parallelJobs, 'number', 'parallelJobs should be a number')
        assert.equal(typeof this.stateFrequency, 'number', 'stateFrequency should be a number')
        assert.equal(typeof this.fns.readdir, 'function', 'readdir should be a function')
        assert.equal(typeof this.fns.copyFile, 'function', 'copyFile should be a function')
    }

    async start() {
        try {
            await this.loadState()
            if ((await this.fns.stat(this.from)).isDirectory()) {
                await mkdirp(this.to)
            } else {
                const basedir = path.dirname(this.to)
                await mkdirp(basedir)
            }
            await this.copy(this.from, this.to)

            // Wait for all jobs to complete.
            while (this.pending.length > 0) {
                await sleep(10)
            }
            await this.processJobErrors()
            return this.state
        } catch (err) {
            err.state = this.state
            throw err
        }
    }

    async loadState() {
        if (!this.stateFile) return
        try {
            await this.fns.stat(this.stateFile)
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
        let err = this.errors.shift()
        while (err) {
            if (this.ignoreErrors) {
                console.error(err)
            } else {
                throw err
            }
            err = this.errors.shift()
        }
    }

    async copy(from, to) {
        if (this.stateCatchUp && !this.state.lastFile.startsWith(from)) return
        if (this.stateCatchUp && this.state.lastFile === from) {
            this.stateCatchUp = false // We're caught up -- yay!
        }
        try {
            const s           = await this.fns.stat(from)
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
                await this.fns.stat(to)
            } catch (err) {
                if (err.code === 'ENOENT') {
                    await mkdir(to)
                } else {
                    throw err
                }
            }
            const files = await this.fns.readdir(from)
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
                await this.fns.stat(to)
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
                await this.fns.copyFile(from, to)
                const speed = pretty(this.fromSize / ((Date.now() - start) / 1000))
                this.log(`Copying: '${to}' (complete) (${speed}/s)`)
            } else {
                await this.fns.copyFile(from, to)
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
