import { exOr } from './exercises.js'
import { modeOf } from './history.js'

const round = (value, step) => Math.max(0, Math.round(value / step) * step)
export function warmupRamp(entry, increment = 2.5) {
  if (!entry || modeOf({ ...entry.target, id: entry.id }) !== 'reps') return []
  const working = entry.sets.find(s => s.type !== 'warmup' && Number(s.w) > 0)
  if (!working) return []
  const step = Number(increment) > 0 ? Number(increment) : 2.5
  const reps = Math.max(1, Number(working.r || entry.target?.reps) || 1)
  return [
    { w: round(working.w * 0.5, step), r: Math.min(8, reps), type: 'warmup', done: false },
    { w: round(working.w * 0.75, step), r: Math.min(5, reps), type: 'warmup', done: false }
  ].filter((set, i, rows) => set.w > 0 && set.w < working.w && !rows.slice(0, i).some(x => x.w === set.w))
}

export function insertWarmups(entry, sets) {
  if (!entry || entry.sets.some(s => s.done)) return false
  const valid = (sets || []).filter(s => Number.isFinite(Number(s.w)) && Number(s.w) >= 0 && Number.isInteger(Number(s.r)) && Number(s.r) >= 1)
    .map(s => ({ w: Number(s.w), r: Number(s.r), type: 'warmup', done: false }))
  if (!valid.length) return false
  entry.sets = [...valid, ...entry.sets.filter(s => s.type !== 'warmup')]
  return true
}

export function plateLoading(total, bar, plates) {
  total = Number(total); bar = Number(bar)
  const available = [...new Set((plates || []).map(Number).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => b - a)
  if (!Number.isFinite(total) || !Number.isFinite(bar) || total < bar || !available.length) return { perSide: [], loaded: bar, remainder: Math.max(0, total - bar) }
  let side = (total - bar) / 2
  const perSide = []
  for (const plate of available) while (side + 1e-9 >= plate) { perSide.push(plate); side = Math.round((side - plate) * 1000) / 1000 }
  return { perSide, loaded: bar + 2 * perSide.reduce((a, b) => a + b, 0), remainder: Math.round(side * 2 * 1000) / 1000 }
}

const terms = text => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
export function equipmentAvailable(exercise, profile) {
  const eq = String(exercise?.eq || '').toLowerCase()
  if (!profile || !String(profile.equipment || '').trim()) return null
  if (/body weight|bodyweight/.test(eq)) return true
  const haystack = terms(profile.equipment)
  return terms(eq).some(word => word.length > 2 && haystack.includes(word))
}

export function approvedAlternatives(entry, profile) {
  return (entry?.target?.substitutes || []).map(exOr).filter(ex => !ex.missing).map(ex => ({ ex, available: equipmentAvailable(ex, profile) }))
}

export function applyApprovedSubstitution(active, index, newId, createEntry) {
  const old = active?.entries?.[index]
  if (!old || old.target?.mandatory || old.sets?.some(set => set.done) || !old.target?.substitutes?.includes(newId)) return false
  const next = createEntry?.(newId)
  if (!next?.id || next.id !== newId) return false
  active.entries[index] = {
    ...next,
    sg: old.sg,
    note: old.note || '',
    target: { ...(next.target || {}), substitutedFrom: old.id, approvedForSession: true }
  }
  return true
}
