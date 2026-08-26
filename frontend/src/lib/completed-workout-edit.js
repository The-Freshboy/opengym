import { workoutVolume } from './history.js'

const clone = value => JSON.parse(JSON.stringify(value))

export function prepareCompletedWorkoutEdit(workout) {
  if (!workout?.id) throw new TypeError('A saved workout with an id is required')
  return { ...clone(workout), cur: 0, editingWorkoutId: workout.id, originalEnd: workout.end }
}

const entryBest = entry => {
  let best = Number(entry?.topW) || 0
  ;(entry?.sets || []).forEach(set => {
    const w = Number(set?.w)
    if (set?.done && Number.isFinite(w) && w > best) best = w
  })
  return best
}

export function recalculateCompletedWorkoutHistory(workouts) {
  const best = new Map()
  return (workouts || []).map(source => {
    const workout = clone(source)
    workout.vol = workoutVolume(workout)
    const prs = []
    ;(workout.entries || []).forEach(entry => {
      const weight = entryBest(entry)
      if (weight > 0 && weight > (best.get(entry.id) || 0)) prs.push(entry.id)
      if (weight > (best.get(entry.id) || 0)) best.set(entry.id, weight)
    })
    workout.prs = prs
    return workout
  })
}

export function recalculateExerciseWeights(exWeights, workouts, exerciseIds) {
  const next = { ...(exWeights || {}) }
  for (const id of new Set(exerciseIds || [])) {
    let best = 0
    let date = null
    ;(workouts || []).forEach(workout => {
      ;(workout.entries || []).forEach(entry => {
        if (entry.id !== id) return
        const weight = entryBest(entry)
        if (weight > best) { best = weight; date = workout.d }
      })
    })
    if (best > 0) next[id] = { w: best, d: date }
    else delete next[id]
  }
  return next
}
