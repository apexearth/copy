import test from 'ava'
import copy from '.'
import fs from 'fs'
import dircompare from 'dir-compare'
import rimraf from 'rimraf'
import {promisify} from 'util'

const stat    = promisify(fs.stat)
const unlink  = promisify(fs.unlink)
const rimrafp = promisify(rimraf)

/**
 * Node Tests
 */
test('copy single file', async t => {
    const from = 'test_files/file1'
    const to   = `test_files_target/copy single file/file1`
    try {
        await unlink(to)
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err
        }
    }
    await copy({
        from,
        to,
    })
    const fromS = await stat(from)
    const toS   = await stat(to)
    t.is(fromS.size, toS.size)
})

test('copy recursive', async t => {
    const from = 'test_files/'
    const to   = `test_files_target/copy recursive/`
    await rimrafp(to)
    await copy({
        from,
        to,
        recursive: true
    })

    const comparison = await dircompare.compare(from, to, {compareSize: true})
    t.is(comparison.same, true)
})

test('copy recursive (all options)', async t => {
    const from = 'test_files/'
    const to   = `test_files_target/copy recursive all options/`
    await rimrafp(to)
    await copy({
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
