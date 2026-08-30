const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v)
export function validateFullBackup(v) {
  if (!isObject(v) || !Array.isArray(v.routines) || !Array.isArray(v.workouts)) throw new Error('This is not a full OpenGym backup.')
  const unsafe = value => isObject(value) ? Object.entries(value).some(([k, x]) => ['__proto__', 'prototype', 'constructor'].includes(k) || unsafe(x)) : Array.isArray(value) && value.some(unsafe)
  if (unsafe(v)) throw new Error('The backup contains unsupported property names.')
  for (const key of ['bodyweight', 'customEx', 'goals', 'goalResults', 'trainingBlocks', 'favoriteEx', 'homeShortcuts']) if (v[key] != null && !Array.isArray(v[key])) throw new Error(`Invalid ${key} list.`)
  for (const key of ['week', 'dayPlan', 'exWeights', 'readiness', 'personal']) if (v[key] != null && !isObject(v[key])) throw new Error(`Invalid ${key} data.`)
  const seen = new Set()
  for (const r of v.routines) {
    if (!isObject(r) || typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.ex) || seen.has(r.id)) throw new Error('Invalid or duplicate routine.')
    seen.add(r.id)
    if (r.ex.some(e => !isObject(e) || typeof e.id !== 'string' || !Number.isFinite(e.sets) || e.sets < 1)) throw new Error('Invalid exercise prescription.')
  }
  for (const w of v.workouts) {
    if (!isObject(w) || typeof w.id !== 'string' || typeof w.d !== 'string' || !Array.isArray(w.entries) || w.entries.some(e => !isObject(e) || typeof e.id !== 'string' || !Array.isArray(e.sets) || e.sets.some(s => !isObject(s)))) throw new Error('Invalid workout history.')
  }
  for (const g of v.goals || []) if (!isObject(g) || typeof g.id !== 'string' || typeof g.name !== 'string' || !['hang', 'beep', 'climbing', 'custom'].includes(g.kind) || !Number.isFinite(g.target) || g.target <= 0) throw new Error('Invalid training goal.')
  for (const r of v.goalResults || []) if (!isObject(r) || typeof r.id !== 'string' || typeof r.goalId !== 'string' || typeof r.d !== 'string' || !Number.isFinite(r.value)) throw new Error('Invalid goal result.')
  return v
}
export function backupSummary(state) {
  return { routines: state?.routines?.length || 0, workouts: state?.workouts?.length || 0, weighIns: state?.bodyweight?.length || 0, goals: state?.goals?.length || 0, results: state?.goalResults?.length || 0, latestWorkout: (state?.workouts || []).map(w => w.d).filter(Boolean).sort().at(-1) || 'None' }
}
export function backupComparison(current, incoming) {
  const before = backupSummary(current), after = backupSummary(incoming)
  const ids = new Set((incoming.workouts || []).map(w => w.id))
  return { before, after, removedWorkouts: (current.workouts || []).filter(w => !ids.has(w.id)).length }
}
