import { modeOf } from './history.js'
import { equipmentKey } from './training-log.js'

const contextKeys = ['hold', 'grip', 'support', 'elbow']
const normal = value => String(value || '').trim().toLowerCase()
export const holdContextComplete = context => contextKeys.every(key => normal(context?.[key]))
export function reuseReason(active, entry, workout, previous) {
  if (!previous || previous.id !== entry.id) return 'Exercise does not match.'
  if (workout.copiedHistory) return 'Copied history is not used for prefilling.'
  if ((workout.entries || []).filter(e => e.id === entry.id).length > 1) return 'Multiple previous entries match; enter your targets manually.'
  if (!workout.unit || workout.unit !== active.unit) return 'Weight units differ or were not recorded.'
  if (equipmentKey(workout.trainingContext) !== equipmentKey(active.trainingContext)) return 'Equipment profile differs.'
  if (normal(previous.setupContext?.note) !== normal(entry.setupContext?.note)) return 'Equipment setup differs or has not been confirmed for this session.'
  const mode = modeOf({ ...entry.target, id: entry.id })
  if (mode !== modeOf({ ...previous.target, id: previous.id })) return 'Logging mode differs.'
  if (normal(entry.target?.repsConvention) !== normal(previous.target?.repsConvention)) return 'Repetition convention differs.'
  if (mode === 'time') {
    if (!holdContextComplete(entry.hangContext) || !holdContextComplete(previous.hangContext)) return 'Record matching hold, grip, assistance and elbow context before prefilling timed holds.'
    if (contextKeys.some(key => normal(entry.hangContext[key]) !== normal(previous.hangContext[key]))) return 'Hold, grip, assistance or elbow context differs.'
  }
  if (!repeatableSets(previous).length) return 'No completed working sets to repeat.'
  return ''
}

// Only prescription numbers are copied. Never carry achieved effort, timer verification,
// completion, records or arbitrary future metadata into a fresh set.
export function repeatableSets(entry) {
  const mode = modeOf({ ...entry.target, id: entry.id })
  const fields = mode === 'time' ? ['sec', 'w'] : mode === 'cardio' ? ['min', 'speed'] : ['w', 'r']
  const required = mode === 'time' ? 'sec' : mode === 'cardio' ? 'min' : 'r'
  return (entry.sets || []).filter(s => s.done && s.type !== 'warmup' && Number.isFinite(s[required]) && s[required] > 0)
    .map(s => Object.fromEntries([['done', false], ['type', 'working'], ...fields.filter(f => Number.isFinite(s[f]) && s[f] >= 0).map(f => [f, s[f]])]))
}

export function lastLoggedExercise(state, entry) {
  const active = state.active
  if (!active || !entry) return null
  return (state.workouts || []).filter(w => w.id !== active?.editingWorkoutId && w.d <= active.d)
    .slice().sort((a, b) => String(b.d).localeCompare(String(a.d)) || (b.start || 0) - (a.start || 0))
    .flatMap(workout => (workout.entries || []).filter(e => e.id === entry.id && e.sets?.some(s => s.done)).map(previous => ({ workout, previous }))) [0] || null
}

export function repeatLastSessionPlan(state) {
  const active = state.active
  if (!active?.routineId || active.editingWorkoutId) return null
  const workout = (state.workouts || []).filter(w => w.routineId === active.routineId && !w.copiedHistory && w.d <= active.d)
    .slice().sort((a, b) => String(b.d).localeCompare(String(a.d)) || (b.start || 0) - (a.start || 0))[0]
  if (!workout) return null
  const matches = active.entries.map((entry, index) => {
    const candidates = (workout.entries || []).filter(e => e.id === entry.id)
    // Duplicate IDs can represent different prescriptions; do not guess which to use.
    if (candidates.length !== 1 || active.entries.filter(e => e.id === entry.id).length !== 1) return null
    const previous = candidates[0]
    return reuseReason(active, entry, workout, previous) ? null : { index, sets: repeatableSets(previous) }
  }).filter(Boolean)
  return { workout, matches, skipped: active.entries.length - matches.length }
}

export function applyRepeatedSets(entry, sets) {
  if (entry.sets.some(s => s.done)) throw new Error('Training has started; keep your logged sets.')
  // Enforce the whitelist here too, so callers cannot accidentally copy achievements.
  const clean = repeatableSets({ ...entry, sets: sets.map(s => ({ ...s, done: true })) })
  if (!clean.length) throw new Error('No valid working sets to repeat.')
  entry.sets = [...entry.sets.filter(s => s.type === 'warmup'), ...clean]
  delete entry.proposal
  delete entry.plan
  delete entry.topW
  delete entry.asked
}
