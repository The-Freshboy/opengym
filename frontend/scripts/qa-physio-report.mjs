// Synthetic data only. Creates a multipage fixture for visual regression review.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { preparePhysioReport, createPhysioPdf } from '../src/lib/physio-report.js'
const entry = { id: 'squat', target: { sets: 3, reps: 8, weight: 30 }, note: 'Controlled range. Discuss technique and stability at next appointment.', sets: [{ done: true, w: 30, r: 8, rir: 3 }, { done: true, w: 30, r: 8, rpe: 7 }, { done: false, w: 40, r: 8 }] }
const S = { unit: 'kg', customEx: [{ id: 'squat', n: 'Goblet squat - controlled tempo' }, { id: 'hold', n: 'Straight-bar flexed-arm hold' }], routines: [{ name: 'SYNTHETIC current plan', ex: [{ id: 'squat', sets: 3, reps: 8, weight: 30, mandatory: true }] }], workouts: Array.from({ length: 4 }, (_, i) => ({ id: `qa${i}`, d: `2026-08-${24 + i}`, name: 'SYNTHETIC QA - lower body and core', unit: i ? 'kg' : undefined, note: 'Example only: not the user’s training. Café / résumé. '.repeat(i === 2 ? 20 : 1), feedback: { energy: 3, jointDiscomfort: i === 2 }, entries: [entry, { id: 'hold', target: { mode: 'time', sets: 2, sec: 10 }, sets: [{ done: true, sec: 12, w: 0 }, { done: true, sec: 10, w: 0 }] }] })) }
S.workouts[0].entries[0].sets[0].type = 'warmup'
S.workouts[0].entries[1].hangContext = { hold: 'Large comfortable holds', grip: 'Open hand', support: 'Feet carry most weight; synthetic example only', elbow: 'Comfortable supported position' }
S.workouts[0].feedback = { energy: 3, tingling: true, numbness: false, weakness: false, symptomLocation: 'Synthetic right hand example', symptomTiming: 'During and next morning; example follow-up wording. '.repeat(5) }
S.programmeHistory = [{ at: '2026-08-28T10:00:00Z', changedDates: ['2026-09-07'] }]
const report = preparePhysioReport(S, { from: '2026-08-01', to: '2026-08-30', notes: true, feedback: true, plan: true })
const doc = await createPhysioPdf(report, readFileSync(new URL('../public/fonts/DejaVuSans.ttf', import.meta.url)).toString('base64'))
mkdirSync('tmp/pdfs', { recursive: true }); writeFileSync('tmp/pdfs/physio-qa.pdf', Buffer.from(doc.output('arraybuffer')))
console.log(`Generated synthetic visual fixture: ${doc.getNumberOfPages()} pages`)
