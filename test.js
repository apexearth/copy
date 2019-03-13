import test from 'ava'
import copy from '.'
import fs from 'fs'
import path from 'path'
import dircompare from 'dir-compare'
import rimraf from 'rimraf'
import {promisify} from 'util'

const stat           = promisify(fs.stat)
const unlink         = promisify(fs.unlink)
const rimrafp        = promisify(rimraf)
const deleteIfExists = async to => {
    try {
        await unlink(to)
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err
        }
    }
}
const [majorVersion] = process.versions.node.split('.').map(parseInt)

/**
 * Node Tests
 */
test('copy single file', async t => {
    const from = 'test_files/file1'
    const to   = 'test_files_target/copy single file/file1'
    await deleteIfExists(to)
    const state = await copy({
        from,
        to,
    })
    const fromS = await stat(from)
    const toS   = await stat(to)
    t.is(fromS.size, toS.size)
    t.is(state.counts.directories, 0)
    t.is(state.counts.files, 1)
    t.is(state.counts.copies, 1)
})

test('copy single file overwriteMismatches', async t => {
    const from = 'test_files/file1'
    const path = 'test_files_target/copy single file overwriteMismatches'
    const to   = 'test_files_target/copy single file overwriteMismatches/file1'
    await rimrafp(path)
    fs.mkdirSync(path)
    fs.writeFileSync(to, 'changed it!')
    let fromS = await stat(from)
    let toS   = await stat(to)
    t.not(fromS.size, toS.size)

    let state = await copy({
        from,
        to,
        overwriteMismatches: true,
    })
    fromS     = await stat(from)
    toS       = await stat(to)
    t.is(fromS.size, toS.size)
    t.is(state.counts.directories, 0)
    t.is(state.counts.files, 1)
    t.is(state.counts.copies, 1)

    state = await copy({
        from,
        to,
        overwriteMismatches: true,
    })
    fromS = await stat(from)
    toS   = await stat(to)
    t.is(fromS.size, toS.size)
    t.is(state.counts.directories, 0)
    t.is(state.counts.files, 1)
    t.is(state.counts.copies, 0)
})

test('copy recursive', async t => {
    const from = 'test_files/'
    const to   = 'test_files_target/copy recursive/'
    await rimrafp(to)
    const state = await copy({
        from,
        to,
        recursive: true
    })
    t.is(state.counts.directories, 4)
    t.is(state.counts.files, 7)
    t.is(state.counts.copies, 7)

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, true)
})

test('copy recursive overwrite', async t => {
    const from = 'test_files/'
    const to   = 'test_files_target/copy recursive overwrite/'
    await rimrafp(to)
    let state = await copy({
        from,
        to,
        recursive: true
    })
    t.is(state.counts.directories, 4)
    t.is(state.counts.files, 7)
    t.is(state.counts.copies, 7)

    state = await copy({
        from,
        to,
        recursive: true,
        overwrite: true,
    })
    t.is(state.counts.directories, 4)
    t.is(state.counts.files, 7)
    t.is(state.counts.copies, 7)

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, true)
})

test('copy recursive state resume', async t => {
    const from      = 'test_files/'
    const to        = 'test_files_target/copy recursive state resume/'
    const stateFile = 'test_files_target/copy recursive state resume.state'
    await deleteIfExists(stateFile)
    await rimrafp(to)

    const err = await t.throwsAsync(async () => await copy({
        from,
        to,
        verbose       : true,
        recursive     : true,
        parallelJobs  : 1,
        stateFrequency: 1,
        state         : stateFile,
        copyFile      : (from, to, done) => {
            if (from.indexOf('file3') !== -1) {
                done(new Error('copy recursive state resume'))
            } else {
                fs.copyFile(from, to, done)
            }
        },
    }))
    t.is(err.state.counts.directories, 2)
    t.is(err.state.counts.files, 2)
    t.is(err.state.counts.copies, 2)

    const state = await copy({
        from,
        to,
        verbose       : true,
        recursive     : true,
        stateFrequency: 1,
        state         : stateFile,
    })
    t.is(state.counts.directories, 4)
    t.is(state.counts.files, 7)
    t.is(state.counts.copies, 7)

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, true)
})

test('copy recursive state resume 2', async t => {
    const from      = 'test_files/'
    const to        = 'test_files_target/copy recursive state resume 2/'
    const stateFile = 'test_files_target/copy recursive state resume 2.state'
    await deleteIfExists(stateFile)
    await rimrafp(to)
    // Setup an in progress directory
    await copy({
        from,
        to,
        recursive: true,
    })
    const wip = [
        'test_files/file2',
        'test_files/sub_directory1/file3',
        'test_files/sub_directory2/file4',
        'test_files/sub_directory2/sub_directory3/file6',
        'test_files/sub_directory2/sub_directory3/file7',
    ]
    for (let ip of wip) {
        await deleteIfExists(ip.replace(from, to))
    }
    await rimrafp(`${to}sub_directory2/sub_directory3`)
    fs.writeFileSync(stateFile, JSON.stringify({
        wip   : wip.map(path.normalize),
        counts: {
            directories: 3,
            files      : 2,
            copies     : 2,
        }
    }, null, 2))

    // Resume from an in progress state.
    const state = await copy({
        from,
        to,
        verbose       : true,
        recursive     : true,
        stateFrequency: 1,
        state         : stateFile,
    })
    t.is(state.counts.directories, 7) // TODO: Not entirely correct since we've gone through some folders twice.
    t.is(state.counts.files, 7)
    t.is(state.counts.copies, 7)

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, true)
})

test('fail when state wip not found', async t => {
    const from      = 'test_files/'
    const to        = 'test_files_target/fail when state wip not found/'
    const stateFile = 'test_files_target/fail when state wip not found.state'
    const wip       = [
        'totally/worthless/junk',
    ]
    fs.writeFileSync(stateFile, JSON.stringify({
        wip   : wip.map(path.normalize),
        counts: {
            directories: 3,
            files      : 3,
            copies     : 3,
        }
    }))

    // Resume from an in progress state.
    await t.throwsAsync(async () => await copy({
        from,
        to,
        verbose       : true,
        recursive     : true,
        stateFrequency: 1,
        state         : stateFile,
    }))

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, false)
})

test('copy recursive (multiple options)', async t => {
    const from      = 'test_files/'
    const to        = 'test_files_target/copy recursive multiple options/'
    const stateFile = 'test_files_target/copy recursive multiple options.state'
    await deleteIfExists(stateFile)
    await rimrafp(to)
    const state = await copy({
        from,
        to,
        recursive     : true,
        overwrite     : true,
        verbose       : true,
        ignoreErrors  : true,
        parallelJobs  : 4,
        state         : stateFile,
        stateFrequency: 100
    })
    t.is(state.counts.directories, 4)
    t.is(state.counts.files, 7)
    t.is(state.counts.copies, 7)

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, true)
})

test('copy non existent file', async t => {
    await t.throwsAsync(async () => await copy({
        from: 'test_files_target/hamburger',
        to  : 'test_files_target/cheeseburger',
    }), {code: 'ENOENT'})
})

test('copy non existent folder recursively', async t => {
    await t.throwsAsync(async () => await copy({
        from     : 'test_files_target/hamburgers',
        to       : 'test_files_target/cheeseburgers',
        recursive: true,
    }), {code: 'ENOENT'})
})

test('throws when no args specified', async t => {
    await t.throwsAsync(async () => await copy({
        // Ahh! No args!
    }))
})

test('import package', t => {
    t.is(typeof require('.'), 'function')
})

test('does not implicitly overwrite', async t => {
    const from = 'test_files/file1'
    const to   = 'test_files_target/does not implicitly overwrite/file1'

    const state = await copy({
        from,
        to,
    })
    t.is(state.counts.directories, 0)
    t.is(state.counts.files, 1)
    t.is(state.counts.copies, 0)

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, false)
})

test('copyFile throw', async t => {
    const from = 'test_files/file1'
    const to   = 'test_files_target/copyFile throw/file1'
    await deleteIfExists(to)

    const err = await t.throwsAsync(async () => await copy({
        from,
        to,
        copyFile: (from, to, done) => done(new Error('copyFile throw')),
    }))
    t.is(err.state.counts.directories, 0)
    t.is(err.state.counts.files, 0)
    t.is(err.state.counts.copies, 0)
})

test('copyFile throw ignoreErrors', async t => {
    const from = 'test_files/file1'
    const to   = 'test_files_target/copyFile throw ignoreErrors/file1'
    await deleteIfExists(to)

    const state = await copy({
        from,
        to,
        ignoreErrors: true,
        copyFile    : (from, to, done) => done(new Error('copyFile throw ignoreErrors')),
    })
    t.is(state.counts.directories, 0)
    t.is(state.counts.files, 1)
    t.is(state.counts.copies, 0)
})

test('copyFile throw recursive', async t => {
    const from = 'test_files'
    const to   = 'test_files_target/copyFile throw recursive'
    await rimrafp(to)

    const err = await t.throwsAsync(async () => await copy({
        from,
        to,
        recursive: true,
        copyFile : (from, to, done) => {
            if (from.indexOf('file3') !== -1) {
                done(new Error('copyFile throw recursive'))
            } else {
                fs.copyFile(from, to, done)
            }
        },
    }))
    t.is(err.state.counts.directories, 3)
    t.is(err.state.counts.files, 2)
    t.is(err.state.counts.copies, 2)
})

test('readdir throw', async t => {
    const from = 'test_files/'
    const to   = 'test_files_target/readdir throw/'
    await rimrafp(to)

    await t.throwsAsync(async () => await copy({
        from,
        to,
        recursive: true,
        readdir  : (path, done) => done(new Error('readdir throw')),
    }))
})

test('readdir throw ignoreErrors', async t => {
    const from = 'test_files/'
    const to   = 'test_files_target/readdir throw ignoreErrors/'
    await rimrafp(to)

    const state = await copy({
        from,
        to,
        recursive   : true,
        ignoreErrors: true,
        readdir     : (path, done) => {
            if (path.indexOf('sub_directory2') !== -1) {
                done(new Error('readdir throw ignoreErrors'))
            } else {
                fs.readdir(path, done)
            }
        },
    })
    t.is(state.counts.directories, 3)
    t.is(state.counts.files, 3)
    t.is(state.counts.copies, 3)
})

test('stat throw', async t => {
    const from = 'test_files/'
    const to   = 'test_files_target/stat throw/'
    await rimrafp(to)

    let err = await t.throwsAsync(async () => await copy({
        from,
        to,
        recursive: true,
        stat     : (path, done) => done(new Error('stat throw')),
    }))
    t.is(err.state.counts.directories, 0)
    t.is(err.state.counts.files, 0)
    t.is(err.state.counts.copies, 0)

    let count = 0
    err       = await t.throwsAsync(async () => await copy({
        from,
        to,
        parallelJobs: 1,
        verbose     : true,
        recursive   : true,
        stat        : (path, done) => {
            if (count === 1 && path.indexOf('file2') !== -1) {
                done(new Error('stat throw'))
            } else {
                if (path.indexOf('file2') !== -1) {
                    count++
                }
                fs.stat(path, done)
            }
        },
    }))
    // If we're version 8 things sync a little differently in some timings.
    // This isn't ideal but low priority for fixing.
    t.is(err.state.counts.directories, majorVersion === 8 ? 1 : 2)
    t.is(err.state.counts.files, 1)
    t.is(err.state.counts.copies, 1)
})

test('stat throw ignoreErrors', async t => {
    const from = 'test_files/'
    const to   = 'test_files_target/stat throw ignoreErrors/'
    await rimrafp(to)

    let state = await copy({
        from,
        to,
        parallelJobs: 1,
        recursive   : true,
        ignoreErrors: true,
        stat        : (path, done) => {
            if (path.indexOf('sub_directory2') !== -1) {
                done(new Error('stat throw ignoreErrors'))
            } else {
                fs.stat(path, done)
            }
        },
    })
    t.is(state.counts.directories, 2)
    t.is(state.counts.files, 3)
    t.is(state.counts.copies, 3)

    await rimrafp(to)
    state = await copy({
        from,
        to,
        recursive   : true,
        ignoreErrors: true,
        stat        : (path, done) => {
            if (path.indexOf('file2') !== -1) {
                done(new Error('stat throw ignoreErrors'))
            } else {
                fs.stat(path, done)
            }
        },
    })
    t.is(state.counts.directories, 4)
    t.is(state.counts.files, 6)
    t.is(state.counts.copies, 6)
})

test.serial('copy recursive json', async t => {
    let output  = []
    const log   = console.log
    console.log = message => output.push(message)

    const from = 'test_files/'
    const to   = 'test_files_target/copy recursive json/'
    await rimrafp(to)
    const state = await copy({
        from,
        to,
        recursive   : true,
        json        : true,
        ignoreErrors: true,
    })
    t.is(state.counts.directories, 4)
    t.is(state.counts.files, 7)
    t.is(state.counts.copies, 7)

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, true)
    t.is(output.length, 14)
    for (let json of output) {
        const object = JSON.parse(json)
        t.is(typeof object, 'object')
        t.is(typeof object.message, 'object')
        t.is(typeof object.state, 'object')
    }

    await rimrafp(to)
    await copy({
        from,
        to,
        recursive   : true,
        json        : false,
        ignoreErrors: true,
    })
    t.is(output.length, 14)

    await rimrafp(to)
    await copy({
        from,
        to,
        recursive   : true,
        json        : 'pretty',
        ignoreErrors: true,
    })
    t.is(output.length, 28)
    t.is(output[14],
        '{\n' +
        '  "message": {\n' +
        '    "file": "test_files_target\\\\copy recursive json\\\\file1",\n' +
        '    "action": "start"\n' +
        '  },\n' +
        '  "state": {\n' +
        '    "wip": [\n' +
        '      "test_files\\\\file1"\n' +
        '    ],\n' +
        '    "counts": {\n' +
        '      "directories": 0,\n' +
        '      "files": 0,\n' +
        '      "copies": 0\n' +
        '    }\n' +
        '  }\n' +
        '}\n'
    )

    console.log = log
})
