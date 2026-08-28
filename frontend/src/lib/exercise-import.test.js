import { describe, expect, it } from 'vitest'
import { parseExerciseImport } from './exercise-import.js'
const ex = (id, n = 'Plank') => ({ id, n, bp: 'waist', eq: 'body weight', tg: 'abs' })

describe('exercise import preview', () => {
  it('reports added, changed, removed and unchanged exercises', () => {
    const r = parseExerciseImport(JSON.stringify([ex('1', 'Front plank'), ex('3')]), [ex('1'), ex('2')])
    expect({ added: r.added.length, changed: r.changed.length, removed: r.removed.length, unchanged: r.unchanged }).toEqual({ added: 1, changed: 1, removed: 1, unchanged: 0 })
  })
  it('rejects invalid JSON and duplicate ids', () => {
    expect(parseExerciseImport('{').ok).toBe(false)
    expect(parseExerciseImport(JSON.stringify([ex('1'), ex('1')])).errors[0]).toMatch(/Duplicate/)
  })
})
