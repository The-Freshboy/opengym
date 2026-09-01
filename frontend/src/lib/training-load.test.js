import { describe, expect, it } from 'vitest'
import { weeklyTrainingLoad, loadObservations } from './training-load.js'

describe('weekly training load', () => {
  it('keeps different logged exposures separate and excludes warm-ups and copied history', () => {
    const rows = weeklyTrainingLoad([
      { d: '2026-08-24', entries: [{ id: 'x', sets: [{ done: true }, { done: true, type: 'warmup' }, { done: false }] }] },
      { d: '2026-08-25', kind: 'activity', activityType: 'Bouldering', durationMin: 60, entries: [] },
      { d: '2026-08-26', copiedHistory: true, entries: [{ id: 'x', sets: [{ done: true }] }] },
      { d: '2026-08-31', entries: [{ id: 'hang', sets: [{ done: true, sec: 5 }, { done: true, sec: 5 }] }] }
    ])
    expect(rows[0]).toMatchObject({ sessions: 2, workingSets: 1, cardioMinutes: 60, climbing: 1 })
    expect(rows[1]).toMatchObject({ sessions: 1, workingSets: 2, hangs: 2 })
  })
  it('describes changes without returning a risk score', () => {
    expect(loadObservations([{ sessions: 1, workingSets: 4, cardioMinutes: 0, hangs: 0 }, { sessions: 3, workingSets: 8, cardioMinutes: 20, hangs: 2 }])).toEqual([
      'sessions increased from 1 to 3', 'working sets increased from 4 to 8', 'cardio minutes resumed after none were logged in the previous week', 'timed holds resumed after none were logged in the previous week'
    ])
    expect(loadObservations([])).toEqual([])
  })
})
