import { describe, it, expect } from 'vitest'
import { EXDB } from './exercises-data.js'
import { FLY_NAMES, withCommonExerciseName } from './exercise-names.js'
describe('fly exercise names', () => {
  it('only relabels existing IDs and preserves prescriptions, instructions and equipment', () => {
    for (const id of Object.keys(FLY_NAMES)) {
      const original = EXDB.find(e => e.id === id)
      expect(original).toBeDefined()
      const renamed = withCommonExerciseName(original)
      expect(renamed.id).toBe(id)
      expect(renamed.eq).toBe(original.eq)
      expect(renamed.st).toEqual(original.st)
      expect(renamed.desc).toContain(original.n)
    }
  })
  it.each(['chest fly', 'rear delt fly'])('exposes dumbbell, cable and machine variations for %s', query => {
    const matches = EXDB.map(withCommonExerciseName).filter(e => e.n.includes(query))
    expect(matches.map(e => e.eq)).toEqual(expect.arrayContaining(['dumbbell', 'cable', 'leverage machine']))
  })
  it('does not mutate the source catalogue or create duplicate entries', () => {
    const before = JSON.stringify(EXDB)
    const mapped = EXDB.map(withCommonExerciseName)
    expect(JSON.stringify(EXDB)).toBe(before)
    expect(mapped.length).toBe(EXDB.length)
    expect(new Set(mapped.map(e => e.id)).size).toBe(new Set(EXDB.map(e => e.id)).size)
  })
})
