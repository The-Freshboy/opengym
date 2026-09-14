import { effectiveRoutineIds } from './history.js'
import { isoOf } from './format.js'
import { isWorkingSet, sessionLoad } from './training-log.js'
import { plannedStateAt } from './programme-history.js'
import { exOr } from './exercises.js'

const COMPOUND_LIFT = /\b(squat|deadlift|bench press|chest press|overhead press|shoulder press|military press|push press|push-up|push up|pull-up|pull up|chin-up|chin up|dip|row|lunge|split squat|step-up|step up|leg press|hack squat|hip thrust|clean|snatch|jerk|thruster|good morning)\b/i
const ISOLATION_OVERRIDE = /\b(calf|wrist|curl|extension|fly|raise|pullover|shrug)\b/i

export function isCompoundLift(name) {
  const value = String(name || '').replace(/[_-]+/g, ' ')
  return COMPOUND_LIFT.test(value) && !ISOLATION_OVERRIDE.test(value)
}

export function insightSummary(S, today = new Date()) {
  const end = new Date(today); end.setHours(23, 59, 59, 999)
  const start = new Date(end); start.setDate(start.getDate() - 27); start.setHours(0, 0, 0, 0)
  const recent = (S.workouts || []).filter(w => new Date(w.d + 'T12:00:00') >= start && new Date(w.d + 'T12:00:00') <= end)
  let planned = 0, completed = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = isoOf(d)
    const ids = effectiveRoutineIds(plannedStateAt(S, iso), iso)
    planned += ids.length
    const done = new Set(recent.filter(w => w.d === iso).map(w => w.routineId))
    completed += ids.filter(id => done.has(id)).length
  }
  const rated = recent.map(sessionLoad).filter(n => n !== null)
  const workload = rated.length ? rated.reduce((a, b) => a + b, 0) : null
  const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 28)
  const previousRows = (S.workouts || []).filter(w => { const d = new Date(w.d + 'T12:00:00'); return d >= previousStart && d < start })
  const previousRated = previousRows.map(sessionLoad).filter(n => n !== null)
  const previous = previousRated.reduce((a, b) => a + b, 0)
  const completeCoverage = rated.length === recent.length && previousRated.length === previousRows.length
  const readiness = Object.entries(S.readiness || {}).filter(([d]) => { const date = new Date(d + 'T12:00:00'); return date >= start && date <= end }).map(([, r]) => (r.sleep + r.energy + (6 - r.soreness)) / 3)
  const readinessAvg = readiness.length ? readiness.reduce((a, b) => a + b, 0) / readiness.length : null
  const climbing = recent.filter(w => w.kind === 'activity' && /climb|boulder/i.test(w.activityType || w.name || ''))
  const bestGrade = climbing.map(w => w.grade).filter(Boolean).at(-1) || null
  return { recent, planned, completed, adherence: planned ? Math.round(completed / planned * 100) : null, workload, ratedSessions: rated.length, workloadChange: completeCoverage && workload !== null && previous > 0 ? Math.round((workload - previous) / previous * 100) : null, readinessAvg, climbing, bestGrade }
}

export function readinessAdvice(S, iso) {
  const r = S.readiness?.[iso]
  if (!r) return null
  if (r.pain) return { level: 'stop', text: 'Pain was reported. Avoid aggravating work and seek qualified advice if it persists.' }
  const score = (r.sleep + r.energy + (6 - r.soreness)) / 3
  if (score < 2.5) return { level: 'reduce', text: 'Low readiness: consider fewer sets, lighter effort, or moving the session.' }
  if (score < 3.5) return { level: 'steady', text: 'Moderate readiness: keep the plan, but avoid forcing personal records.' }
  return { level: 'good', text: 'Readiness looks good. Train as planned and adjust from your warm-up.' }
}

export function expandedRecords(S) {
  const out = []
  const exerciseNames = new Map((S.customEx || []).map(exercise => [exercise.id, exercise.n]))
  const exerciseName = id => exerciseNames.get(id) || exOr(id).n || 'Unknown exercise'
  for (const w of S.workouts || []) {
    if (w.kind === 'activity') {
      if (w.durationMin) out.push({ key: 'activity-duration', group: 'activity', type: 'Longest activity', name: w.activityType || w.name || 'Activity', value: `${w.durationMin} min`, score: w.durationMin, date: w.d })
      if (w.sends) out.push({ key: 'climbing-sends', group: 'activity', type: 'Most climbing sends', name: w.activityType || w.name || 'Climbing', value: String(w.sends), score: w.sends, date: w.d })
      if (w.flashes) out.push({ key: 'climbing-flashes', group: 'activity', type: 'Most climbing flashes', name: w.activityType || w.name || 'Climbing', value: String(w.flashes), score: w.flashes, date: w.d })
    }
    for (const e of w.entries || []) for (const s of e.sets || []) if (isWorkingSet(s)) {
      const name = exerciseName(e.id)
      if (s.sec) {
        const seconds = Number(s.sec)
        const value = seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} sec`
        out.push({ key: `timed:${e.id || name}`, group: 'timed', type: 'Longest timed hold', name, value, score: seconds, date: w.d })
      }
      const reps = s.r ?? s.reps
      const unit = w.unit || S.unit || 'kg'
      if (reps > 0 && s.w > 0) out.push({ key: `weight:${e.id || name}:${unit}`, group: isCompoundLift(name) ? 'compound' : 'other', type: 'Heaviest completed set', name, value: `${s.w} ${unit} × ${reps}`, score: s.w, date: w.d, assumedUnit: !w.unit })
    }
  }
  const best = new Map()
  for (const record of out) if (!best.has(record.key) || record.score > best.get(record.key).score) best.set(record.key, record)
  const order = { compound: 0, other: 1, timed: 2, activity: 3 }
  return [...best.values()].sort((a, b) => order[a.group] - order[b.group] || a.name.localeCompare(b.name) || b.date.localeCompare(a.date))
}
