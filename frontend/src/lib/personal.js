import { modeOf, buildSets } from './history.js'
import { nextPrescription, readSession, policyFor } from './progression.js'

// These are conservative product rules, not a validated readiness/injury model.
export const COMPARABLE_EXPOSURES = 3
// Snapshot the saved prescription, independently of session targets. An explicit plan
// edit takes precedence over a previously accepted suggestion or logged working load.
const basePrescription = (cfg, routine) => JSON.stringify([modeOf(cfg), cfg.sets, cfg.reps, cfg.sec, cfg.min, cfg.speed, cfg.weight || 0, policyFor(cfg, routine), cfg.inc, cfg.repsMin])
export function exerciseHistory(S, id, excludeId) {
  return (S.workouts || []).filter(w => w.id !== excludeId)
    .flatMap(w => (w.entries || []).filter(e => e.id === id).map(entry => ({ ...entry, d: w.d, workoutId: w.id, routineId: w.routineId, feedback: w.feedback, rating: w.rating, sessionNote: w.note, incomplete: w.incomplete, variant: w.variant, unit: w.unit })))
    .sort((a, b) => String(b.d).localeCompare(String(a.d)))
}

export function preparePersonalEntry(S, cfg, routine, today) {
  const mode = modeOf(cfg)
  const base = basePrescription(cfg, routine)
  const sameBase = e => e?.basePrescription ? e.basePrescription === base : !!e?.target && basePrescription(e.target, routine) === base
  const rows = exerciseHistory(S, cfg.id).filter(e => e.d <= today && modeOf({ ...e.target, id: e.id }) === mode && e.sets?.some(x => x.done))
  // Do not seed working sets from an all-time record or another routine's prescription.
  const last = rows.find(e => e.routineId === routine?.id && (!e.unit || e.unit === S.unit))
  const baselineState = { ...S, workouts: [], exWeights: {} }
  const carry = sameBase(last) ? last : null
  const target = { ...cfg }
  if (carry?.basePrescription && policyFor(cfg, routine, mode) !== 'off') {
    // These are already accepted targets, not a new increase. Keep them until the
    // routine changes; only a new suggestion needs another approval.
    if (mode === 'time' && Number.isFinite(carry.target?.sec)) target.sec = carry.target.sec
    if (mode === 'reps' && Number.isFinite(carry.target?.reps)) target.reps = carry.target.reps
  }
  const baseline = buildSets(baselineState, target).map((s, i) => {
    const prior = carry?.sets?.[i]
    return { ...s, ...(prior?.done && Number.isFinite(prior.w) && mode !== 'cardio' ? { w: prior.w } : {}), done: false }
  })
  if (baseline.length && mode !== 'cardio') target.weight = baseline[0].w || 0
  const plan = { kind: 'hold', why: ['Targets unchanged. Adjust from your warm-up; no increase is automatic.'] }
  const entry = { id: cfg.id, sg: cfg.sg, target, plan, sets: baseline, basePrescription: base }
  if (S.readiness?.[today]?.pain || rows.slice(0, 3).some(e => e.feedback?.jointDiscomfort === true)) {
    plan.why = ['Joint discomfort was reported. No progression suggested; avoid aggravating work and discuss symptoms or instability with your Exercise Physiologist.']
    plan.safety = true
    return entry
  }
  if (policyFor(cfg, routine, mode) === 'off' || mode === 'cardio') return entry
  if (!last) { plan.why = ['No comparable history yet. Set a comfortable starting load; saved/default weights are not a tested baseline.']; return entry }
  const fingerprint = e => JSON.stringify([e.routineId, e.unit || S.unit, modeOf({ ...e.target, id: e.id }), e.target?.sets, e.target?.reps, e.target?.sec, e.target?.prog || routine?.prog, e.target?.inc, e.target?.repsMin, e.sets?.map(s => s.w || 0)])
  const recent = rows.slice(0, 3)
  const cutoff = new Date(today + 'T12:00:00Z'); cutoff.setUTCDate(cutoff.getUTCDate() - 42)
  const comparable = recent.length === 3 && recent.every(e => e.target && sameBase(e) && !e.incomplete && e.variant !== 'short' && e.d >= cutoff.toISOString().slice(0, 10) && e.routineId === routine?.id && fingerprint(e) === fingerprint(last))
    && new Set(recent.map(e => e.d)).size === 3
    && recent.every(e => e.sets.length === cfg.sets && new Set(e.sets.map(s => s.w || 0)).size === 1)
    && last.target.sets === cfg.sets && (mode === 'time' ? last.target.sec === target.sec : last.target.reps === target.reps)
  if (!comparable) { plan.why = ['Wait for three comparable exposures on separate days at the same targets and loads. Short, incomplete or old sessions are not equivalent.']; return entry }
  const readings = recent.map(e => readSession(e, cfg))
  const allHit = readings.every(r => r.ok)
  const allMiss = readings.every(r => !r.ok)
  const hard = recent.some(e => e.rating === 'hard' || (e.sets || []).some(s => s.done && ((Number.isFinite(s.rir) && s.rir < 2) || (Number.isFinite(s.rpe) && s.rpe > 8))))
  if ((!allHit && !allMiss) || (allHit && hard)) { plan.why = ['Mixed results or high effort: repeat the current targets and review the trend.']; return entry }
  // Personal progression never prescribes failure work or invents load increments.
  if (policyFor(cfg, routine, mode) === 'greyskull') { plan.why = ['Failure-based progression needs individual review; no automatic suggestion.']; return entry }
  if (!(cfg.inc > 0)) { plan.why = ['Set an exercise-specific increment in the routine before requesting a progression suggestion.']; return entry }
  const history = recent.slice().reverse().map(e => ({ d: e.d, entries: [e] }))
  const proposal = policyFor(cfg, routine, mode) === 'double' && allHit && last.target.reps < cfg.reps
    ? { policy: 'double', kind: 'up', weight: baseline[0].w, reps: Math.min(cfg.reps, last.target.reps + 1), why: ['Keep the load and build back towards the top of the rep range.'] }
    : nextPrescription({ ...S, workouts: history }, cfg, routine)
  if (!['up', 'deload'].includes(proposal.kind)) return entry
  entry.proposal = { ...proposal, status: 'pending', evidenceDates: recent.map(e => e.d), reason: `${allHit ? 'Three comparable target completions' : 'Three comparable target misses'}. This is a conservative rule-based suggestion, not a clinical recommendation.`, basis: JSON.stringify(baseline) }
  plan.why = ['A suggestion is available below. Your targets stay unchanged until you accept it.']
  return entry
}

export function acceptPersonalProposal(entry) {
  const p = entry.proposal
  if (!p || p.status !== 'pending' || entry.sets.some(s => s.done) || p.basis !== JSON.stringify(entry.sets)) throw new Error('Targets changed or training has started. Keep your current sets and review next session.')
  entry.sets = entry.sets.map(s => ({ ...s, ...(Number.isFinite(p.weight) ? { w: p.weight } : {}), ...(Number.isFinite(p.reps) ? { r: p.reps } : {}), ...(Number.isFinite(p.sec) ? { sec: p.sec } : {}) }))
  for (const key of ['weight', 'reps', 'sec']) if (Number.isFinite(p[key])) entry.target[key] = p[key]
  p.status = 'accepted'; p.decidedAt = new Date().toISOString()
  entry.plan = { ...p, why: ['You accepted these targets. They carry forward until you edit the saved prescription; the routine itself is unchanged.'] }
}

// Nothing is optional by inference: unmarked and mandatory exercises stay in a short session.
export function sessionExercises(routine, variant = 'full') {
  return (routine?.ex || []).filter(e => variant !== 'short' || !e.optional || e.mandatory).map(e => ({ ...e }))
}

export function protectedPlanErrors(current, incoming) {
  const errors = []
  for (const r of current.routines || []) for (const e of r.ex || []) if (e.mandatory) {
    const kept = incoming.routines?.find(x => x.id === r.id)?.ex?.find(x => x.id === e.id)
    if (!kept || !kept.mandatory || kept.optional) errors.push(`Mandatory exercise ${e.id} in ${r.name} would be removed or unprotected.`)
  }
  return errors
}

export const GOAL_TEMPLATES = [
  { kind: 'hang', name: 'Flexed-arm hang', target: 25, unit: 'seconds', protocol: 'Straight bar; chin above, not resting on bar; overhand or underhand grip.' },
  { kind: 'beep', name: '20 m beep test', target: 7, targetShuttle: 5, unit: 'level/shuttle', notBefore: '2026-09-10', protocol: 'Record completed level and shuttle from the required 20 m test audio. Treadmill training is not a test result.' },
  { kind: 'climbing', name: 'Climbing consistency', target: 1, unit: 'sessions/week', protocol: 'Logged climbing or bouldering activities; grades remain separate by discipline.' },
]
export function validateResult(goal, result, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.d || '') || !Number.isFinite(Date.parse(result.d + 'T12:00:00Z')) || new Date(result.d + 'T12:00:00Z').toISOString().slice(0, 10) !== result.d || result.d > today) return 'Choose a valid date no later than today.'
  if (goal.notBefore && result.d < goal.notBefore) return `Testing is unavailable before ${goal.notBefore}.`
  if (!Number.isFinite(result.value) || result.value < 0 || result.value > 100000) return 'Enter a valid non-negative result.'
  if (goal.kind === 'beep' && (!Number.isInteger(result.value) || result.value < 1 || result.value > 21 || !Number.isInteger(result.shuttle) || result.shuttle < 1 || result.shuttle > 30)) return 'Enter the completed level (1–21) and shuttle (1–30) separately; check them against your test protocol.'
  if (goal.kind === 'hang' && !result.standard) return 'Confirm this was an unassisted chin-above-straight-bar test. Log assisted practice in your workout instead.'
  return null
}
export function goalResults(S, goal) {
  return (S.goalResults || []).filter(r => r.goalId === goal.id).sort((a, b) => a.d.localeCompare(b.d) || String(a.id).localeCompare(String(b.id)))
}
export function goalReached(goal, result) {
  if (!result) return false
  if (goal.kind === 'beep') return result.value > goal.target || (result.value === goal.target && result.shuttle >= goal.targetShuttle)
  return result.value >= goal.target
}
export function weeklySummary(S, today) {
  const end = new Date(today + 'T12:00:00Z')
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  const from = start.toISOString().slice(0, 10)
  const workouts = (S.workouts || []).filter(w => w.d >= from && w.d <= today)
  const completed = workouts.filter(w => w.kind === 'activity' || w.entries?.some(e => e.sets?.some(s => s.done)))
  return { from, to: today, sessions: completed.length, climbing: completed.filter(w => w.kind === 'activity' && /climb|boulder/i.test(w.activityType || w.name || '')).length, loggedResults: (S.goalResults || []).filter(r => r.d >= from && r.d <= today).length, rated: completed.filter(w => w.feedback && Object.keys(w.feedback).length).length }
}
