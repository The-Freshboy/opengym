import { describe, expect, it } from 'vitest'
import { expandedRecords, insightSummary, readinessAdvice } from './insights.js'

describe('insights', () => {
  it('uses retained previous planning intent before a template edit', () => {
    const S = { routines: [{ id: 'new' }], week: {}, dayPlan: {}, workouts: [{ d: '2026-08-29', routineId: 'old', durationMin: 20 }], programmeHistory: [{ at: '2026-08-30T12:00:00Z', previous: { routines: [{ id: 'old' }], week: {}, dayPlan: { '2026-08-29': ['old'] } } }] }
    const x = insightSummary(S, new Date('2026-08-30T12:00:00'))
    expect(x.completed).toBe(1); expect(x.planned).toBe(1)
  })
  it('counts adherence across multiple routines on one day', () => {
    const S = { routines: [{ id: 'a' }, { id: 'b' }], week: { 6: ['a', 'b'] }, dayPlan: {}, workouts: [{ d: '2026-08-29', routineId: 'a', start: 1, end: 600001 }] }
    const x = insightSummary(S, new Date('2026-08-29T12:00:00'))
    expect(x.completed).toBe(1); expect(x.planned).toBeGreaterThanOrEqual(2)
  })
  it('suggests reducing work on low readiness', () => expect(readinessAdvice({ readiness: { x: { sleep: 1, energy: 2, soreness: 5 } } }, 'x').level).toBe('reduce'))
  it('includes timed and climbing records', () => {
    const records = expandedRecords({ unit: 'kg', workouts: [{ d: 'x', kind: 'activity', durationMin: 60, sends: 3 }, { d: 'y', entries: [{ sets: [{ done: true, sec: 45 }] }] }] })
    expect(records.map(x => x.type)).toContain('Longest timed hold'); expect(records.map(x => x.type)).toContain('Most climbing sends')
  })
})
