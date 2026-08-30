import { describe, it, expect } from 'vitest'
import { TIMER_DEFAULTS as base, timerError, timerPhases, phaseRemaining, timerClock, remainingSession } from './hang-timer.js'
describe('hang interval timer', () => {
  it('formats remaining time with ceiling and optional hours', () => {
    expect(timerClock(29000)).toBe('00:29')
    expect(timerClock(1)).toBe('00:01')
    expect(timerClock(3599999)).toBe('01:00:00')
    expect(timerClock(-1)).toBe('00:00')
  })
  it('totals the current remainder and later phases after a jump', () => {
    const p = timerPhases(base)
    expect(remainingSession(p, 0, 10000)).toBe(110000)
    expect(remainingSession(p, 2, 29000)).toBe(34000)
    expect(remainingSession(p, 3, 0)).toBe(0)
  })
  it('uses editable short example intervals, not the screenshot dose', () => {
    expect(timerPhases(base).map(p => [p.kind, p.seconds])).toEqual([['Get ready', 10], ['Hang', 5], ['Rest', 90], ['Hang', 5]])
  })
  it('separates cycles with recovery and omits final rest', () => {
    const p = timerPhases({ ...base, cycles: 2, warmup: 20, cooldown: 30 })
    expect(p.map(x => x.kind)).toEqual(['Get ready', 'Warm up', 'Hang', 'Rest', 'Hang', 'Recover', 'Hang', 'Rest', 'Hang', 'Cool down'])
    expect(p.filter(x => x.kind === 'Hang').map(x => [x.cycle, x.set])).toEqual([[1, 1], [1, 2], [2, 1], [2, 2]])
  })
  it('skips optional zero durations and supports one set', () => {
    expect(timerPhases({ ...base, countdown: 0, sets: 1 })).toEqual([{ kind: 'Hang', seconds: 5, cycle: 1, set: 1 }])
  })
  it.each(['', -1, 1.5, Infinity, NaN, 3601])('rejects invalid hang value %s', hang => {
    expect(timerError({ ...base, hang })).toBeTruthy()
    expect(timerPhases({ ...base, hang })).toEqual([])
  })
  it('rejects zero work and excessive total sets', () => {
    expect(timerError({ ...base, hang: 0 })).toBeTruthy()
    expect(timerError({ ...base, sets: 50, cycles: 50 })).toBeTruthy()
  })
  it('accepts form strings', () => expect(timerError({ ...base, hang: '5' })).toBeNull())
  it('uses elapsed time rather than counting callbacks', () => {
    expect(phaseRemaining(5000, 1750)).toBe(3250)
    expect(phaseRemaining(5000, 6000)).toBe(0)
  })
})
