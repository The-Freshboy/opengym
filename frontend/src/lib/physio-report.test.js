import { describe, it, expect } from 'vitest'
import { preparePhysioReport, reportOptionsError, createPhysioPdf } from './physio-report.js'
import { readFileSync } from 'node:fs'
const state = { unit: 'kg', customEx: [{ id: 'hang', n: 'Straight-bar hold' }], routines: [{ name: 'Base', ex: [{ id: 'hang', mode: 'time', sets: 2, sec: 10, mandatory: true }] }], workouts: [{ id: 'w1', d: '2026-08-28', name: 'Upper', unit: 'kg', note: 'PRIVATE SESSION', feedback: { energy: 2, jointDiscomfort: true }, entries: [{ id: 'hang', target: { mode: 'time', sets: 2, sec: 10 }, note: 'PRIVATE EXERCISE', sets: [{ sec: 12, w: 0, done: true, rir: 2 }, { sec: 999, done: false }] }] }], coachIntake: { medication: 'NEVER EXPORT' }, bodyweight: [{ v: 112 }], goals: [{ id: 'g', name: 'Beep', kind: 'beep' }], goalResults: [{ d: '2026-08-28', goalId: 'g', value: 7, shuttle: 5, note: 'PRIVATE TEST' }] }
const options = { from: '2026-08-01', to: '2026-08-30' }
describe('physio report privacy and accuracy', () => {
  it('only exports completed sets and does not change state', () => {
    const before = JSON.stringify(state), r = preparePhysioReport(state, options)
    expect(r.sessions[0].rows).toHaveLength(1)
    expect(r.sessions[0].rows[0][2]).toContain('12 s')
    expect(JSON.stringify(r)).not.toContain('999')
    expect(r.results[0][2]).toBe('Level 7, shuttle 5')
    expect(JSON.stringify(state)).toBe(before)
  })
  it('defaults to no notes, joint feedback, current plan or private account data', () => {
    const text = JSON.stringify(preparePhysioReport(state, options))
    for (const secret of ['PRIVATE', 'NEVER EXPORT', 'jointDiscomfort', '112']) expect(text).not.toContain(secret)
    expect(preparePhysioReport(state, options).routines).toEqual([])
  })
  it('includes only explicitly enabled optional sections', () => {
    const r = preparePhysioReport(state, { ...options, notes: true, feedback: true, plan: true, tests: false })
    expect(JSON.stringify(r)).toContain('PRIVATE SESSION')
    expect(JSON.stringify(r)).toContain('Joint discomfort reported: yes')
    expect(r.routines[0].rows[0][2]).toBe('Mandatory base')
    expect(r.results).toEqual([])
  })
  it('honours date range and flags legacy unit assumptions', () => {
    expect(preparePhysioReport(state, { ...options, to: '2026-08-27' }).sessions).toHaveLength(0)
    const copy = structuredClone(state); delete copy.workouts[0].unit
    const r = preparePhysioReport(copy, options)
    expect(r.assumedUnit).toBe(true); expect(r.sessions[0].rows[0][2]).toContain('(assumed)')
  })
  it('rejects missing, impossible and reversed dates', () => {
    for (const o of [{ from: '', to: '' }, { from: '2026-02-30', to: options.to }, { from: options.to, to: options.from }]) expect(reportOptionsError(o)).toBeTruthy()
  })
  it('supports legacy history with a null prescription', () => {
    const copy = structuredClone(state); copy.workouts[0].entries[0].target = null
    const r = preparePhysioReport(copy, options)
    expect(r.sessions[0].rows[0][2]).toContain('12 s')
    expect(r.sessions[0].rows[0][4]).toContain('not logged')
  })
  it('generates a PDF with embedded font', async () => {
    const font = readFileSync(new URL('../../public/fonts/DejaVuSans.ttf', import.meta.url)).toString('base64')
    const doc = await createPhysioPdf(preparePhysioReport(state, options), font)
    expect(doc.output().startsWith('%PDF-')).toBe(true)
    expect(doc.getNumberOfPages()).toBeGreaterThan(0)
  })
})
