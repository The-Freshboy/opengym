import fs from 'node:fs'
import path from 'node:path'

export const emptyDatabase = () => ({ users: [], creds: [], subs: [], invites: [], audit: [], ptProfiles: {} })

export function loadDatabase(file) {
  let raw
  try { raw = fs.readFileSync(file, 'utf8') }
  catch (error) {
    if (error.code === 'ENOENT') return emptyDatabase()
    throw new Error('Account database could not be read; startup stopped to protect existing data', { cause: error })
  }
  let db
  try { db = JSON.parse(raw) }
  catch (error) { throw new Error('Account database is corrupt; startup stopped to protect existing data', { cause: error }) }
  if (!db || typeof db !== 'object' || Array.isArray(db) || !Array.isArray(db.users) || !Array.isArray(db.creds))
    throw new Error('Account database has an invalid structure; startup stopped to protect existing data')
  for (const key of ['subs', 'invites', 'audit']) if (db[key] !== undefined && !Array.isArray(db[key]))
    throw new Error(`Account database has invalid ${key}; startup stopped to protect existing data`)
  if (db.ptProfiles !== undefined && (!db.ptProfiles || typeof db.ptProfiles !== 'object' || Array.isArray(db.ptProfiles)))
    throw new Error('Account database has invalid PT profiles; startup stopped to protect existing data')
  return { ...db, subs: db.subs || [], invites: db.invites || [], audit: db.audit || [], ptProfiles: db.ptProfiles || {} }
}

export function saveDatabase(file, db) {
  const tmp = file + '.tmp'
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 })
  const fd = fs.openSync(tmp, 'r+')
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  fs.renameSync(tmp, file)
}
