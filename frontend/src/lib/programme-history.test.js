import { expect, it } from 'vitest'
import { recordProgrammeChange, plannedStateAt } from './programme-history.js'
it('records planning changes but not workout or preference edits', () => {
  const before = { routines: [], week: { 1: ['a'] } }, after = { ...before, week: { 1: ['b'] } }
  expect(recordProgrammeChange(before, after, '2026-09-01T10:00:00Z')).toBe(true)
  expect(plannedStateAt(after, '2026-08-31').week[1]).toEqual(['a'])
  expect(plannedStateAt(after, '2026-09-02').week[1]).toEqual(['b'])
  expect(recordProgrammeChange(before, { ...before, workouts: [1] })).toBe(false)
})
it('bounds snapshot growth and preserves exact dated changes', () => {
  const before = { programmeHistory: Array.from({ length: 10 }, () => ({ at: 'old' })) }
  const after = { dayPlan: { '2026-09-07': ['a'] } }
  recordProgrammeChange(before, after)
  expect(after.programmeHistory).toHaveLength(10)
  expect(after.programmeHistory.at(-1).changedDates).toEqual(['2026-09-07'])
})
