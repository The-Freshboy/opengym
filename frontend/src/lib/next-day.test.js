import { describe, it, expect } from 'vitest'
import { nextCalendarDate, checkInWorkouts, saveNextDayCheckIn, nextDaySymptoms } from './next-day.js'
import { duplicateKnownHistory } from './training-log.js'
import { exerciseHistory } from './personal.js'

const draft = { jointDiscomfort: false, tingling: false, numbness: true, weakness: false, change: 'same', note: '  Stable  ' }
describe('next-day check-ins', () => {
  it('uses calendar days across months, leap years and daylight saving', () => {
    expect(nextCalendarDate('2028-02-28')).toBe('2028-02-29')
    expect(nextCalendarDate('2026-10-04')).toBe('2026-10-05')
    expect(nextCalendarDate('2026-12-31')).toBe('2027-01-01')
    expect(nextCalendarDate('2026-02-30')).toBeNull()
  })
  it('only offers yesterday’s original workouts, separately', () => {
    const workouts = [{ id: 'a', d: '2026-08-31' }, { id: 'b', d: '2026-08-31' }, { d: '2026-08-30' }, { d: '2026-08-31', copiedHistory: true }]
    expect(checkInWorkouts(workouts, '2026-09-01').map(w => w.id)).toEqual(['a', 'b'])
  })
  it('requires explicit answers, rejects stale dates and preserves training', () => {
    const s = { workouts: [{ id: 'a', d: '2026-08-31', entries: [{ id: 'x', sets: [{ w: 30, done: true }] }] }] }
    const before = structuredClone(s.workouts[0].entries)
    expect(() => saveNextDayCheckIn(s, 'a', {}, '2026-09-01')).toThrow()
    expect(() => saveNextDayCheckIn(s, 'a', draft, '2026-09-02')).toThrow()
    saveNextDayCheckIn(s, 'a', draft, '2026-09-01', 'timestamp')
    expect(s.workouts[0].entries).toEqual(before)
    expect(s.workouts[0].nextDayCheckIn.note).toBe('Stable')
    expect(exerciseHistory(s, 'x')[0].nextDayCheckIn.numbness).toBe(true)
    expect(duplicateKnownHistory(s.workouts[0], '2026-08-31', '2026-09-01', 'b', true).nextDayCheckIn).toBeUndefined()
  })
  it('does not interpret missing responses as an explicit symptom report', () => {
    expect(nextDaySymptoms(undefined)).toBe(false)
    expect(nextDaySymptoms({ status: 'recorded', numbness: true })).toBe(true)
  })
})
