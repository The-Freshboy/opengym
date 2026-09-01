import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { emptyDatabase, loadDatabase, saveDatabase } from '../database.js'

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-db-'))

test('a missing account database starts empty', () => {
  assert.deepEqual(loadDatabase(path.join(temp(), 'db.json')), emptyDatabase())
})

test('a corrupt or structurally invalid account database fails closed', () => {
  for (const value of ['{broken', '{}', '{"users":[],"creds":[],"subs":{}}']) {
    const file = path.join(temp(), 'db.json'); fs.writeFileSync(file, value)
    assert.throws(() => loadDatabase(file), /startup stopped to protect existing data/)
    assert.equal(fs.readFileSync(file, 'utf8'), value)
  }
})

test('database writes are atomic and retain existing fields', () => {
  const file = path.join(temp(), 'db.json'), db = { ...emptyDatabase(), custom: { retained: true } }
  saveDatabase(file, db)
  assert.deepEqual(loadDatabase(file), db)
  assert.equal(fs.existsSync(file + '.tmp'), false)
})
