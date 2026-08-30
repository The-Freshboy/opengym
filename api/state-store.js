import fs from 'node:fs'
import path from 'node:path'

const safe = uid => String(uid).replace(/[^a-zA-Z0-9_-]/g, '')
const atomicWrite = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, content)
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
  const snapshotDir = uid => path.join(dataDir, 'snapshots', safe(uid))
  const readJson = target => { try { return JSON.parse(fs.readFileSync(target, 'utf8')) } catch { return null } }
  const read = uid => {
    const state = readJson(file(uid))
    const meta = readJson(metaFile(uid)) || {}
    return { state, revision: Number.isInteger(meta.revision) ? meta.revision : (state ? 1 : 0), updatedAt: meta.updatedAt || null }
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
    atomicWrite(path.join(snapshotDir(uid), id + '.json'), JSON.stringify({ ...record, id, createdAt: now().toISOString() }))
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
  const write = (uid, state, expectedRevision) => {
    const current = read(uid)
    if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== current.revision)
      throw new StateConflict(current)
    ensureDaily(uid, current)
    snapshot(uid, current)
    const updatedAt = now().toISOString()
    const revision = current.revision + 1
    atomicWrite(file(uid), JSON.stringify(state))
    atomicWrite(metaFile(uid), JSON.stringify({ revision, updatedAt }))
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
