import { describe, expect, it } from 'vitest'
import { prepareCompletedWorkoutEdit, recalculateCompletedWorkoutHistory, recalculateExerciseWeights } from './completed-workout-edit.js'

const workout = (id, d, weight, reps = 5) => ({
  id, d, start: 100, end: 200, entries: [{ id: 'bench', sets: [{ w: weight, r: reps, done: true }] }],
})

describe('completed workout editing', () => {
  it('preserves identity, date and timing in an independent edit copy', () => {
    const saved = workout('w1', '2026-08-01', 80)
    const edit = prepareCompletedWorkoutEdit(saved)
    expect(edit).toMatchObject({ id: 'w1', d: '2026-08-01', start: 100, originalEnd: 200, editingWorkoutId: 'w1' })
    edit.entries[0].sets[0].w = 75
    expect(saved.entries[0].sets[0].w).toBe(80)
  })

  it('recalculates volume and PR badges across later history', () => {
    const result = recalculateCompletedWorkoutHistory([
      workout('w1', '2026-01-01', 100), workout('w2', '2026-01-08', 90), workout('w3', '2026-01-15', 110),
    ])
    expect(result.map(w => w.vol)).toEqual([500, 450, 550])
    expect(result.map(w => w.prs)).toEqual([['bench'], [], ['bench']])
  })

  it('corrects the remembered weight used by the next workout', () => {
    const current = { bench: { w: 250, d: '2026-01-01' }, squat: { w: 140, d: '2026-01-01' } }
    const result = recalculateExerciseWeights(current, [workout('w1', '2026-01-08', 25)], ['bench'])
    expect(result.bench).toEqual({ w: 25, d: '2026-01-08' })
    expect(result.squat).toEqual(current.squat)
  })
})
