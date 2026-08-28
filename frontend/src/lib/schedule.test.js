import { describe, expect, it } from 'vitest'
import { effectiveRoutineIds, movePlannedRoutine, routineIds } from './history.js'

const state = () => ({
  routines: [{ id: 'gym' }, { id: 'climb' }, { id: 'run' }],
  week: { 3: 'gym', 4: 'run' },
  dayPlan: {}
})

describe('multi-routine scheduling', () => {
  it('reads legacy scalar and new array schedule values', () => {
    const S = state()
    expect(effectiveRoutineIds(S, '2026-08-26')).toEqual(['gym'])
    S.dayPlan['2026-08-26'] = ['gym', 'climb', 'gym']
    expect(effectiveRoutineIds(S, '2026-08-26')).toEqual(['gym', 'climb'])
    expect(routineIds('rest')).toEqual([])
  })

  it('moves only the selected occurrence and keeps both surrounding schedules', () => {
    const S = state()
    S.dayPlan['2026-08-26'] = ['gym', 'climb']
    expect(movePlannedRoutine(S, '2026-08-26', '2026-08-27', 'gym')).toBe(true)
    expect(effectiveRoutineIds(S, '2026-08-26')).toEqual(['climb'])
    expect(effectiveRoutineIds(S, '2026-08-27')).toEqual(['run', 'gym'])
    expect(S.week).toEqual({ 3: 'gym', 4: 'run' })
  })

  it('marks the source as rest when its only occurrence moves', () => {
    const S = state()
    movePlannedRoutine(S, '2026-08-26', '2026-08-28', 'gym')
    expect(S.dayPlan['2026-08-26']).toBe('rest')
    expect(effectiveRoutineIds(S, '2026-08-28')).toEqual(['gym'])
  })
})
