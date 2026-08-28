import { describe, expect, it } from 'vitest'
import { makeActivity, missedSessions, moveWeeklyRoutine, shiftRemainingWeek, clearFutureDayOverrides } from './activities.js'
import { effectiveRoutineIds } from './history.js'

const state = () => ({ routines: [{ id: 'gym' }, { id: 'climb' }], week: { 1: 'gym', 2: 'climb' }, dayPlan: {}, workouts: [] })

describe('activities and schedule recovery', () => {
  it('clears stale future overrides when a recurring weekday changes', () => {
    const S = state(); S.dayPlan = { '2026-08-24': 'climb', '2026-08-31': 'climb', '2026-08-25': 'gym', '2026-08-17': 'climb' }
    clearFutureDayOverrides(S, 1, '2026-08-24')
    expect(S.dayPlan).toEqual({ '2026-08-25': 'gym', '2026-08-17': 'climb' })
  })
  it('creates a bounded standalone activity record', () => {
    const a = makeActivity({ d: '2026-08-28', type: 'Climbing', durationMin: 90, intensity: 12, note: 'Bouldering' }, 1)
    expect(a).toMatchObject({ kind: 'activity', activityType: 'Climbing', durationMin: 90, intensity: 10, entries: [] })
  })
  it('moves one recurring routine without removing another', () => {
    const S = state(); S.week[1] = ['gym', 'climb']
    expect(moveWeeklyRoutine(S, 1, 3, 'gym')).toBe(true)
    expect(S.week[1]).toEqual(['climb']); expect(S.week[3]).toEqual(['gym'])
  })
  it('shifts the remaining week while retaining target activities', () => {
    const S = state(); shiftRemainingWeek(S, '2026-08-24')
    expect(effectiveRoutineIds(S, '2026-08-24')).toEqual([])
    expect(effectiveRoutineIds(S, '2026-08-25')).toContain('gym')
    expect(effectiveRoutineIds(S, '2026-08-26')).toContain('climb')
  })
  it('finds only planned routines not completed in the last fortnight', () => {
    const S = state(); S.workouts.push({ d: '2026-08-24', routineId: 'gym' })
    expect(missedSessions(S, '2026-08-26').some(x => x.iso === '2026-08-24')).toBe(false)
    expect(missedSessions(S, '2026-08-26')).toContainEqual({ iso: '2026-08-25', routineId: 'climb' })
  })
})
