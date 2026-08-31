import { describe, it, expect } from 'vitest'
import { weeklyDashboard } from './weekly-dashboard.js'

const customEx = [{ id: 'run', n: 'Treadmill running' }, { id: 'mixed', n: 'Treadmill walk / run' }, { id: 'hang', n: 'Flexed-arm hang' }, { id: 'climb', n: 'Climbing' }]
const entry = (id, sets, hangContext) => ({ id, sets, hangContext })
const workout = (entries, extra = {}) => ({ d: '2026-08-31', entries, ...extra })
const summary = workouts => weeklyDashboard({ customEx, workouts }, '2026-09-02')

describe('weekly dashboard', () => {
  it('excludes copied history from all performance and activity totals', () => {
    const result = summary([workout([entry('run', [{ min: 30, done: true }]), entry('hang', [{ sec: 25, done: true }])], { copiedHistory: true }), workout([], { kind: 'activity', activityType: 'Climbing', copiedHistory: true })])
    expect(result.sessions).toBe(0); expect(result.runningMinutes).toBe(0); expect(result.climbingSessions).toBe(0); expect(result.hangs).toEqual([])
  })
  it('does not count activity durations twice or treat cycling as running', () => {
    const result = summary([workout([entry('run', [{ min: 15, done: true }])], { kind: 'activity', activityType: 'Running', durationMin: 15 }), workout([], { kind: 'activity', activityType: 'Cycling', durationMin: 20 })])
    expect(result.runningMinutes).toBe(15); expect(result.otherCardioMinutes).toBe(20)
  })
  it('uses Monday boundaries, excludes future and empty workouts, keeps partial separate', () => {
    const result = summary([workout([]), workout([entry('run', [{ min: 12, done: true }])]), workout([entry('run', [{ min: 8, done: true }])], { incomplete: true }), workout([entry('run', [{ min: 50, done: true }])], { d: '2026-09-03' })])
    expect(result.from).toBe('2026-08-31'); expect(result.sessions).toBe(1); expect(result.partial).toBe(1); expect(result.runningMinutes).toBe(20)
  })
  it('does not infer completed duration from target, speed or workout time', () => {
    const result = summary([workout([entry('run', [{ min: 15, done: false }, { speed: 12, done: true }]), entry('mixed', [{ min: 20, done: true }])], { start: 1, end: 3600001 })])
    expect(result.runningMinutes).toBe(0); expect(result.otherCardioMinutes).toBe(20)
  })
  it('counts climbing once per session, explicit running activities use recorded minutes', () => {
    const result = summary([workout([entry('climb', [{ min: 10, done: true }]), entry('climb', [{ min: 5, done: true }])]), workout([], { kind: 'activity', activityType: 'Bouldering', durationMin: 60 }), workout([], { kind: 'activity', activityType: 'Running', durationMin: 15 }), workout([], { kind: 'activity', activityType: 'Running', start: 1, end: 3600001 })])
    expect(result.climbingSessions).toBe(2); expect(result.runningMinutes).toBe(15)
  })
  it('separates assistance and only compares identical recorded conditions', () => {
    const context = { support: 'unassisted', grip: 'underhand', hold: 'straight bar', elbow: 'flexed' }
    const sets = [{ sec: 10, done: true }, { sec: 80, done: false }, { sec: 90, done: true, type: 'warmup' }]
    const result = summary([workout([entry('hang', sets, context), entry('hang', [{ sec: 20, done: true }], { support: 'band-assisted' }), entry('hang', [{ sec: 12, done: true }])]), workout([entry('hang', [{ sec: 8, done: true }], context), entry('hang', [{ sec: 100, done: true }], { ...context, grip: 'overhand' })], { d: '2026-08-30' })])
    expect(result.hangs).toHaveLength(3); expect(result.hangGroups.map(h => h.assistance)).toEqual(['unassisted', 'assisted', 'unknown'])
    expect(result.hangGroups[0].previousBest).toBe(8); expect(result.hangGroups[2].previousBest).toBeNull()
  })
  it('does not mutate history and handles empty state', () => {
    const state = { customEx, workouts: [workout([entry('hang', [{ sec: 5, done: true }])])] }
    const before = JSON.stringify(state); weeklyDashboard(state, '2026-09-02'); expect(JSON.stringify(state)).toBe(before)
    expect(weeklyDashboard({}, '2026-08-31').sessions).toBe(0)
  })
})
