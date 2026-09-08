import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA = process.env.DATA_DIR || '/data'
const DIR = path.join(DATA, 'coach-context')
const MAX_MESSAGES = 120
const MAX_CONTEXTS = 100
const MAX_CONTEXT_DAYS = 366
export const CONTEXT_REASONS = Object.freeze(['travel', 'illness', 'work', 'injury', 'equipment', 'deload', 'schedule', 'other'])
const DEFAULT_ADHERENCE_REASONS = new Set(['travel', 'illness', 'work', 'injury', 'deload', 'schedule'])

const safe = uid => String(uid).replace(/[^a-zA-Z0-9_-]/g, '')
const fileFor = uid => path.join(DIR, safe(uid) + '.json')
const id = () => crypto.randomBytes(10).toString('base64url')
const now = () => new Date().toISOString()
const text = (value, max) => String(value ?? '').trim().slice(0, max)

function validDate(value) {
  const s = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T12:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function daySpan(from, to) {
  return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000) + 1
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function readCoachContext(uid) {
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(uid), 'utf8'))
    return {
      messages: Array.isArray(parsed?.messages) ? parsed.messages.slice(-MAX_MESSAGES) : [],
      contexts: Array.isArray(parsed?.contexts) ? parsed.contexts.slice(-MAX_CONTEXTS) : []
    }
  } catch {
    return { messages: [], contexts: [] }
  }
}

function writeCoachContext(uid, rec) {
  atomicWrite(fileFor(uid), {
    messages: (rec.messages || []).slice(-MAX_MESSAGES),
    contexts: (rec.contexts || []).slice(-MAX_CONTEXTS)
  })
}

export function normaliseContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('context must be an object')
  const reason = CONTEXT_REASONS.includes(input.reason) ? input.reason : null
  const from = String(input.from || '')
  const to = String(input.to || '')
  if (!reason) throw new Error(`context reason must be one of: ${CONTEXT_REASONS.join(', ')}`)
  if (!validDate(from) || !validDate(to)) throw new Error('context needs valid from/to dates')
  if (from > to) throw new Error('context start date must not be after its end date')
  if (daySpan(from, to) > MAX_CONTEXT_DAYS) throw new Error(`context may cover at most ${MAX_CONTEXT_DAYS} days`)
  const note = text(input.note, 600)
  const affectsAdherence = input.affectsAdherence == null ? DEFAULT_ADHERENCE_REASONS.has(reason) : !!input.affectsAdherence
  return { reason, from, to, affectsAdherence, ...(note ? { note } : {}) }
}

export function addCoachContext(uid, input) {
  const clean = normaliseContext(input)
  const rec = readCoachContext(uid)
  const context = { id: id(), ...clean, source: 'user', createdAt: now() }
  rec.contexts.push(context)
  writeCoachContext(uid, rec)
  return context
}

export function removeCoachContext(uid, contextId) {
  const rec = readCoachContext(uid)
  const before = rec.contexts.length
  rec.contexts = rec.contexts.filter(c => c.id !== contextId)
  if (rec.contexts.length === before) return false
  writeCoachContext(uid, rec)
  return true
}

export function recordCoachUserMessage(uid, { jobId, message, reviewId = null, contextId = null }) {
  const clean = text(message, 1500)
  if (!clean) throw new Error('message required')
  const rec = readCoachContext(uid)
  const row = {
    id: id(), role: 'user', jobId: text(jobId, 80),
    text: clean, reviewId: text(reviewId, 80) || null,
    contextId: text(contextId, 80) || null, createdAt: now()
  }
  rec.messages.push(row)
  writeCoachContext(uid, rec)
  return row
}

export function recordCoachAssistantMessage(uid, { jobId, text: answer, reviewId = null, revised = false, changes = 0, failed = false }) {
  const clean = text(answer, 4000)
  if (!clean) return null
  const rec = readCoachContext(uid)
  if (rec.messages.some(m => m.role === 'assistant' && m.jobId === jobId)) return null
  const row = {
    id: id(), role: 'assistant', jobId: text(jobId, 80),
    text: clean, reviewId: text(reviewId, 80) || null,
    revised: !!revised, changes: Math.max(0, Math.min(25, Number(changes) || 0)),
    failed: !!failed, createdAt: now()
  }
  rec.messages.push(row)
  writeCoachContext(uid, rec)
  return row
}

export function contextForPayload(uid, { from = null, to = null } = {}) {
  const rec = readCoachContext(uid)
  return rec.contexts.filter(c => {
    if (!from || !to) return true
    return c.from <= to && c.to >= from
  }).slice(-30).map(c => ({
    reason: c.reason, from: c.from, to: c.to,
    affectsAdherence: !!c.affectsAdherence,
    ...(c.note ? { note: c.note } : {}), source: 'user'
  }))
}

export function conversationForPayload(uid, limit = 12) {
  return readCoachContext(uid).messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.text && !m.failed)
    .slice(-Math.max(1, Math.min(30, Number(limit) || 12)))
    .map(m => ({ role: m.role, text: text(m.text, m.role === 'assistant' ? 2000 : 1200), at: m.createdAt || null }))
}

export function clearCoachContext(uid) {
  try { fs.unlinkSync(fileFor(uid)) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
