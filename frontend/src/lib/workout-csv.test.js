import { it, expect } from 'vitest'
import { workoutCsv } from './workout-csv.js'
it('exports performed work without health notes or unfinished targets', () => {
  const csv = workoutCsv({ unit: 'kg', workouts: [{ name: '=formula()', note: 'PRIVATE', feedback: { notes: 'PRIVATE' }, entries: [{ id: 'x', sets: [{ done: true, w: 10, r: 8 }, { done: false, w: 999 }] }] }] })
  expect(csv).toContain("'=formula()")
  expect(csv).toContain('kg (assumed)')
  expect(csv).not.toContain('PRIVATE'); expect(csv).not.toContain('999')
  expect(csv.split('\r\n')).toHaveLength(2)
})
