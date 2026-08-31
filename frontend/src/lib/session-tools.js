import { modeOf, supersetUnits, unitOf } from './history.js'
import { TIMER_DEFAULTS, timerError } from './hang-timer.js'

export const validRest = value => value !== '' && value != null && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 3600
export const exerciseRest = (state, entry) => Number(validRest(entry?.restSec) ? entry.restSec : validRest(entry?.target?.restSec) ? entry.target.restSec : validRest(state.restSec) ? state.restSec : 90)
const fingerprint = entry => JSON.stringify(entry)

export function linkedHang(state, index) {
  const active = state.active, entry = active?.entries?.[index]
  if (!entry || active.editingWorkoutId || modeOf({ ...entry.target, id: entry.id }) !== 'time') return null
  // Keep supersets in their intended alternating order, not consecutive holds.
  if (unitOf(supersetUnits(active.entries), index).length > 1) return null
  const indices = entry.sets.flatMap((set, i) => !set.done && set.type !== 'warmup' ? [i] : [])
  if (!indices.length || indices.some(i => entry.sets[i].sec !== entry.sets[indices[0]].sec)) return null
  const config = { ...TIMER_DEFAULTS, hang: entry.sets[indices[0]].sec, sets: indices.length, rest: exerciseRest(state, entry), cycles: 1, recovery: 0 }
  if (timerError(config)) return null
  return { activeId: active.id, index, exerciseId: entry.id, fingerprint: fingerprint(entry), indices, config }
}
export function linkIsCurrent(state, link) {
  return !!link && state.active?.id === link.activeId && !state.active.editingWorkoutId && fingerprint(state.active.entries?.[link.index]) === link.fingerprint
}
export function confirmLinkedHangs(state, link, values) {
  if (!linkIsCurrent(state, link)) throw new Error('The workout changed. Return to your workout and launch a fresh timer; nothing was logged.')
  if (values.length !== link.indices.length || !values.some(v => v !== '')) throw new Error('Enter at least one achieved hold. Leave unperformed sets blank.')
  if (values.some(v => v !== '' && (!Number.isInteger(Number(v)) || Number(v) < 1 || Number(v) > 3600))) throw new Error('Achieved holds must be whole seconds from 1 to 3600, or blank.')
  values.forEach((v, i) => { if (v !== '') Object.assign(state.active.entries[link.index].sets[link.indices[i]], { sec: Number(v), done: true, timerConfirmed: true }) })
}
export function deferExercise(state, index) {
  const active = state.active
  if (!active || active.editingWorkoutId || !active.entries[index]) return false
  const units = supersetUnits(active.entries), unit = unitOf(units, index)
  if (unit === units.at(-1) || unit.some(i => active.entries[i].sets.some(s => s.done))) return false
  const moved = unit.map(i => active.entries[i])
  active.entries = [...active.entries.filter((_, i) => !unit.includes(i)), ...moved]
  active.cur = unit[0]
  return true
}
export const setupKey = (active, id) => JSON.stringify([active?.trainingContext?.equipmentProfile?.id || 'unspecified', id])
export function saveSetup(state, index, text, at = new Date().toISOString()) {
  const active = state.active, entry = active?.entries?.[index]
  if (!entry || active.editingWorkoutId || entry.sets.some(s => s.done)) return
  const key = setupKey(active, entry.id), note = String(text).trim().slice(0, 500)
  const location = active.trainingContext?.equipmentProfile?.name || 'Unspecified location'
  state.trainingPreferences ||= {}
  const memory = state.trainingPreferences.exerciseSetups || []
  state.trainingPreferences.exerciseSetups = [...memory.filter(m => m.key !== key), { key, note, location, at }].slice(-200)
  entry.setupContext = { note, location, at }
  state.setupHistory = [...(state.setupHistory || []), { at, exerciseId: entry.id, location, note }].slice(-100)
}
