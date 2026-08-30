import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const safe = uid => String(uid).replace(/[^a-zA-Z0-9_-]/g, '')
const checksum = record => crypto.createHash('sha256').update(JSON.stringify({ state: record.state, revision: record.revision })).digest('hex')
const atomicWrite = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, content, { mode: 0o600 })
  const fd = fs.openSync(tmp, 'r+')
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  fs.renameSync(tmp, file)
}

export class StateConflict extends Error {
  constructor(current) {
    super('This profile changed on another device')
    this.name = 'StateConflict'
    this.current = current
  }
}

export function createStateStore(dataDir, { recentLimit = 10, dailyLimit = 30, now = () => new Date() } = {}) {
  const file = uid => path.join(dataDir, `state-${safe(uid)}.json`)
  const metaFile = uid => path.join(dataDir, `state-${safe(uid)}.meta.json`)
  const journalFile = uid => path.join(dataDir, `state-${safe(uid)}.pending.json`)
  const snapshotDir = uid => path.join(dataDir, 'snapshots', safe(uid))
  const readJson = target => { try { return JSON.parse(fs.readFileSync(target, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return null; throw new Error('Stored training data is unreadable; restore a verified backup', { cause: e }) } }
  // A durable redo record keeps the compatible state/meta files together after a restart.
  const recover = uid => {
    const pending = readJson(journalFile(uid))
    if (!pending) return
    if (!pending.state || !Number.isInteger(pending.revision) || pending.revision < 1) throw new Error('Invalid state recovery journal')
    atomicWrite(file(uid), JSON.stringify(pending.state))
    atomicWrite(metaFile(uid), JSON.stringify({ revision: pending.revision, updatedAt: pending.updatedAt, appliedOperations: pending.appliedOperations || [] }))
    fs.unlinkSync(journalFile(uid))
  }
  const read = uid => {
    recover(uid)
    const state = readJson(file(uid))
    const meta = readJson(metaFile(uid)) || {}
    return { state, revision: Number.isInteger(meta.revision) ? meta.revision : (state ? 1 : 0), updatedAt: meta.updatedAt || null, ...(meta.appliedOperations?.length ? { appliedOperations: meta.appliedOperations } : {}) }
  }
  const prune = (dir, prefix, limit) => {
    if (!fs.existsSync(dir)) return
    const files = fs.readdirSync(dir).filter(x => x.startsWith(prefix) && x.endsWith('.json')).sort().reverse()
    for (const old of files.slice(limit)) fs.unlinkSync(path.join(dir, old))
  }
  const snapshot = (uid, record, kind = 'recent') => {
    if (!record.state) return null
    const stamp = now().toISOString().replace(/[:.]/g, '-')
    const id = `${kind}-${stamp}-r${record.revision}`
    atomicWrite(path.join(snapshotDir(uid), id + '.json'), JSON.stringify({ ...record, checksum: checksum(record), id, createdAt: now().toISOString() }))
    prune(snapshotDir(uid), 'recent-', recentLimit)
    if (kind === 'daily') prune(snapshotDir(uid), 'daily-', dailyLimit)
    return id
  }
  const ensureDaily = (uid, record) => {
    if (!record.state) return
    const day = now().toISOString().slice(0, 10)
    const dir = snapshotDir(uid)
    const exists = fs.existsSync(dir) && fs.readdirSync(dir).some(x => x.startsWith(`daily-${day}`))
    if (!exists) snapshot(uid, record, 'daily')
  }
  const write = (uid, state, expectedRevision, { operationId } = {}) => {
    const current = read(uid)
    if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== current.revision)
      throw new StateConflict(current)
    ensureDaily(uid, current)
    snapshot(uid, current)
    const updatedAt = now().toISOString()
    const revision = current.revision + 1
    const appliedOperations = [...new Set([...(current.appliedOperations || []), ...(operationId ? [operationId] : [])])].slice(-100)
    atomicWrite(journalFile(uid), JSON.stringify({ state, revision, updatedAt, appliedOperations }))
    atomicWrite(file(uid), JSON.stringify(state))
    atomicWrite(metaFile(uid), JSON.stringify({ revision, updatedAt, appliedOperations }))
    fs.unlinkSync(journalFile(uid))
    return { state, revision, updatedAt }
  }
  const list = uid => {
    const dir = snapshotDir(uid)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(x => x.endsWith('.json')).map(x => readJson(path.join(dir, x)))
      .filter(Boolean).map(({ state, ...meta }) => meta).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }
  const preview = (uid, id) => {
    if (!/^((recent|daily)-[a-zA-Z0-9_-]+)$/.test(String(id))) throw new Error('invalid snapshot')
    const saved = readJson(path.join(snapshotDir(uid), id + '.json'))
    if (!saved?.state) throw new Error('snapshot not found')
    if (saved.checksum && saved.checksum !== checksum(saved)) throw new Error('snapshot integrity check failed')
    return saved
  }
  const restore = (uid, id, expectedRevision) => {
    if (!Number.isInteger(expectedRevision)) throw new Error('current revision required')
    const saved = preview(uid, id)
    return write(uid, saved.state, expectedRevision)
  }
  const backup = uid => ensureDaily(uid, read(uid))
  return { file, read, write, list, restore, preview, backup }
}
