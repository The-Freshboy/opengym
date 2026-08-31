import { protectedPlanErrors } from './personal.js'
export const PLAN_FIELDS = ['routines', 'week', 'dayPlan', 'customEx', 'exWeights']

const clone = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value
const same = (a, b) => JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null))
const byId = list => new Map((list || []).map(item => [String(item.id), item]))
const names = list => list.slice(0, 8).map(x => x.name || x.n || x.id)
const FIELD_LABELS = { ex: 'Exercises', sets: 'Sets', reps: 'Reps', repsMin: 'Minimum reps', repsConvention: 'Rep counting', w: 'Weight', weight: 'Weight', rest: 'Rest (seconds)', sec: 'Duration (seconds)', min: 'Duration (minutes)', speed: 'Speed (km/h)', duration: 'Duration', seconds: 'Seconds', name: 'Name', n: 'Name', desc: 'Instructions', note: 'Notes', notes: 'Notes', d: 'Date', id: 'ID', mode: 'Tracking mode', progression: 'Progression', video: 'Demonstration video' }
const displayValue = value => value === undefined ? 'Not set' : value === null ? 'None' : typeof value === 'string' ? (value || '(empty)') : JSON.stringify(value)

// Leaf-level comparisons also expose less common prescription fields rather than silently
// omitting them. Array positions are deliberate: exercise order is part of a routine.
function fieldChanges(before, after, path, exerciseNames) {
  if (same(before, after) && (before === undefined) === (after === undefined)) return []
  const object = value => value !== null && typeof value === 'object'
  if ((object(before) || before === undefined) && (object(after) || after === undefined) && (object(before) || object(after))) {
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    if (keys.length) return keys.flatMap(key => {
      const item = after?.[key] ?? before?.[key]
      const label = Array.isArray(before) || Array.isArray(after)
        ? `${Number(key) + 1}. ${item?.name || item?.n || exerciseNames[item?.id] || item?.id || 'Item'}`
        : FIELD_LABELS[key] || key
      return fieldChanges(before?.[key], after?.[key], `${path} → ${label}`, exerciseNames)
    })
  }
  return [{ field: path, before: displayValue(before), after: displayValue(after) }]
}

export function validateReviewedBackup(data) {
  const errors = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['This is not an OpenGym backup.'] }
  if (!Array.isArray(data.routines)) errors.push('The backup has no routines list.')
  if (!data.week || typeof data.week !== 'object' || Array.isArray(data.week)) errors.push('The backup has no weekly schedule.')
  if (!data.dayPlan || typeof data.dayPlan !== 'object' || Array.isArray(data.dayPlan)) errors.push('The backup has no dated plan.')
  if (!Array.isArray(data.customEx)) errors.push('The backup has no custom exercise list.')
  if (!data.exWeights || typeof data.exWeights !== 'object' || Array.isArray(data.exWeights)) errors.push('The backup has no starting-weight data.')
  if (errors.length) return { ok: false, errors }

  const ids = new Set()
  data.routines.forEach((routine, i) => {
    if (!routine || typeof routine !== 'object' || !String(routine.id || '').trim() || !String(routine.name || '').trim()) errors.push(`Routine ${i + 1} needs an id and name.`)
    if (ids.has(routine?.id)) errors.push(`Duplicate routine id: ${routine.id}.`)
    ids.add(routine?.id)
    if (!Array.isArray(routine?.ex)) errors.push(`${routine?.name || `Routine ${i + 1}`} has no exercise list.`)
  })
  const validRef = value => value == null || value === 'rest' || (Array.isArray(value) ? value : [value]).every(id => ids.has(id))
  for (const [day, value] of Object.entries(data.week)) if (!validRef(value)) errors.push(`Weekly schedule day ${day} refers to a missing routine.`)
  for (const [date, value] of Object.entries(data.dayPlan)) if (!validRef(value)) errors.push(`${date} refers to a missing routine.`)
  return { ok: !errors.length, errors: errors.slice(0, 30) }
}

function listChanges(current, incoming, label) {
  const before = byId(current), after = byId(incoming)
  const added = (incoming || []).filter(x => !before.has(String(x.id)))
  const removed = (current || []).filter(x => !after.has(String(x.id)))
  const changed = (incoming || []).filter(x => before.has(String(x.id)) && !same(x, before.get(String(x.id))))
  return { label, changed: !!(added.length || removed.length || changed.length), added, removed, modified: changed }
}

export function compareReviewedBackup(current, incoming, catalogueNames = {}) {
  const exerciseNames = { ...catalogueNames, ...Object.fromEntries([...(current.customEx || []), ...(incoming.customEx || [])].map(ex => [ex.id, ex.n || ex.name || ex.id])) }
  const routines = listChanges(current.routines, incoming.routines, 'Routines and exercises')
  const custom = listChanges(current.customEx, incoming.customEx, 'Custom exercises')
  const weekDays = [...new Set([...Object.keys(current.week || {}), ...Object.keys(incoming.week || {})])].filter(k => !same(current.week?.[k], incoming.week?.[k]))
  const dates = [...new Set([...Object.keys(current.dayPlan || {}), ...Object.keys(incoming.dayPlan || {})])].filter(k => !same(current.dayPlan?.[k], incoming.dayPlan?.[k]))
  const weights = [...new Set([...Object.keys(current.exWeights || {}), ...Object.keys(incoming.exWeights || {})])].filter(k => !same(current.exWeights?.[k], incoming.exWeights?.[k]))
  const sections = [
    { key: 'routines', label: routines.label, changed: routines.changed, count: routines.added.length + routines.removed.length + routines.modified.length,
      summary: `${routines.added.length} added · ${routines.modified.length} changed · ${routines.removed.length} removed`,
      details: [...names(routines.added), ...names(routines.modified), ...names(routines.removed)].slice(0, 8) },
    { key: 'week', label: 'Weekly schedule', changed: !!weekDays.length, count: weekDays.length, summary: `${weekDays.length} days changed`, details: weekDays.map(k => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][+k] || k) },
    { key: 'dayPlan', label: 'Dated plan', changed: !!dates.length, count: dates.length, summary: `${dates.length} dates changed`, details: dates.slice(0, 8) },
    { key: 'customEx', label: custom.label, changed: custom.changed, count: custom.added.length + custom.removed.length + custom.modified.length,
      summary: `${custom.added.length} added · ${custom.modified.length} changed · ${custom.removed.length} removed`,
      details: [...names(custom.added), ...names(custom.modified), ...names(custom.removed)].slice(0, 8) },
    { key: 'exWeights', label: 'Starting weights and progression', changed: !!weights.length, count: weights.length, summary: `${weights.length} exercises changed`, details: weights.slice(0, 8) }
  ]
  const routineName = (state, id) => state.routines?.find(r => String(r.id) === String(id))?.name || String(id)
  const scheduleValue = (state, value) => value === undefined ? 'Not set' : value === null || value === 'rest' ? 'Rest' : (Array.isArray(value) ? value : [value]).map(id => routineName(state, id)).join(' + ')
  for (const section of sections) {
    // Detect reordering too, even when every ID and prescription is unchanged.
    section.changed = !same(current[section.key], incoming[section.key])
    if (section.key === 'week' || section.key === 'dayPlan') {
      const keys = section.key === 'week' ? weekDays : dates.sort()
      section.changes = keys.map(key => ({ field: section.key === 'week' ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][+key] || key : key,
        before: scheduleValue(current, current[section.key]?.[key]), after: scheduleValue(incoming, incoming[section.key]?.[key]) }))
    } else if (section.key === 'exWeights') {
      section.changes = weights.flatMap(id => fieldChanges(current.exWeights?.[id], incoming.exWeights?.[id], exerciseNames[id] || id, exerciseNames))
    } else {
      section.changes = fieldChanges(current[section.key], incoming[section.key], section.label, exerciseNames)
      if (section.changed && !section.count) section.summary = 'Order changed'
    }
  }
  return { sections: sections.filter(s => s.changed), changed: sections.some(s => s.changed) }
}

export const snapshotPlan = state => Object.fromEntries(PLAN_FIELDS.map(key => [key, clone(state[key] ?? (key === 'routines' || key === 'customEx' ? [] : {}))]))

export function applyReviewedPlan(target, incoming) {
  const errors = protectedPlanErrors(target, incoming)
  if (errors.length) throw new Error(errors.join(' '))
  for (const key of PLAN_FIELDS) target[key] = clone(incoming[key])
  target.active = null
}

export function restoreReviewedPlan(target, snapshot) {
  for (const key of PLAN_FIELDS) if (Object.prototype.hasOwnProperty.call(snapshot || {}, key)) target[key] = clone(snapshot[key])
  target.active = null
}
