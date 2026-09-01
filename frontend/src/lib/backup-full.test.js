import { describe, expect, it } from 'vitest'
import { validateFullBackup } from './backup-full.js'

describe('full backup validation', () => {
  it('accepts a bounded OpenGym backup', () => expect(validateFullBackup({ workouts: [], routines: [] })).toBeTruthy())
  it('rejects arrays and missing required collections', () => {
    expect(() => validateFullBackup([])).toThrow()
    expect(() => validateFullBackup({ workouts: [] })).toThrow()
  })
  it('rejects pathological record counts', () => {
    expect(() => validateFullBackup({ workouts: Array(10001).fill({}), routines: [] })).toThrow(/too many/)
  })
})
