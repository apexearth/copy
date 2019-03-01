const fs          = require('fs')
const path        = require('path')
const {promisify} = require('util')
const readdir     = promisify(fs.readdir)
const copyFile    = promisify(fs.copyFile)
const stat        = promisify(fs.stat)
const mkdir       = promisify(fs.mkdir)
const program     = require('commander')
const pretty      = require('prettysize')
const {version}   = require('./package.json')

class Copy {
    constructor(options) {
        this.from         = options.from
        this.to           = options.to
        this.recursive    = options.recursive
        this.overwrite    = options.overwrite
        this.verbose      = options.verbose
        this.ignoreErrors = options.ignoreErrors
    }

    async start() {
        await this.copy(this.from, this.to)
    }

    async copy(from, to) {
        try {
            const s           = await stat(from)
            const isDirectory = s.isDirectory()
            if (isDirectory && this.recursive) {
                await this.copyDirectory(from, to)
            } else if (!isDirectory) {
                this.fromSize = s.size
                await this.copyFile(from, to)
            }
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
        }
    }

    async copyFile(from, to) {
        try {
            if (this.verbose) {
                process.stdout.write(`Copying: '${to}' ...`)
            }
            try {
                await stat(to)
                if (this.overwrite) {
                    await this.doCopy(from, to)
                } else {
                    if (this.verbose) {
                        console.log('skipped.')
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
        }
    }

    async doCopy(from, to) {
        try {
            if (this.verbose) {
                const start = Date.now()
                await copyFile(from, to)
                const speed = pretty(this.fromSize / ((Date.now() - start) / 1000))
                console.log(`complete. (${speed}/s)`)
            } else {
                await copyFile(from, to)
            }
        } catch (err) {
            if (this.ignoreErrors) {
                console.log(`error.`)
                console.error(err)
            } else {
                throw err
            }
        }
    }
}

module.exports = Copy

if (require.main === module) {
    program
        .version(version)
        .arguments('<from> <to>')
        .option('-r --recursive', 'Copy recursively.')
        .option('-o --overwrite', 'Overwrite existing.')
        .option('-v --verbose', 'Verbose output.')
        .option('-e --ignore-errors', 'Ignore errors.')
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
