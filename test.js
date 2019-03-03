import test from 'ava'
import copy from '.'
import fs from 'fs'
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

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, true)
})

test('copy recursive (all options)', async t => {
    const from = 'test_files/'
    const to   = 'test_files_target/copy recursive all options/'
    await rimrafp(to)
    const state = await copy({
        from,
        to,
        recursive     : true,
        overwrite     : true,
        verbose       : true,
        ignoreErrors  : true,
        parallelJobs  : 4,
        state         : 'test_files_target/copy recursive all options.state',
        stateFrequency: 100
    })
    t.is(state.counts.directories, 4)
    t.is(state.counts.files, 7)

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
    t.is(state.counts.files, 0)

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
    t.is(state.counts.files, 0)
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

    let count = 0
    err       = await t.throwsAsync(async () => await copy({
        from,
        to,
        recursive: true,
        stat     : (path, done) => {
            if (count === 1 && path.indexOf('file2') !== -1) {
                done(new Error('stat throw'))
            } else {
                if(path.indexOf('file2') !== -1) {
                    count++
                }
                fs.stat(path, done)
            }
        },
    }))
    t.is(err.state.counts.directories, 2)
    t.is(err.state.counts.files, 0)
})

test('stat throw ignoreErrors', async t => {
    const from = 'test_files/'
    const to   = 'test_files_target/stat throw ignoreErrors/'
    await rimrafp(to)

    let state = await copy({
        from,
        to,
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
})
