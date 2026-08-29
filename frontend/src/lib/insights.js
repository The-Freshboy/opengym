import { effectiveRoutineIds } from './history.js'
import { isoOf } from './format.js'

export function insightSummary(S, today = new Date()) {
  const end = new Date(today); end.setHours(23, 59, 59, 999)
  const start = new Date(end); start.setDate(start.getDate() - 27); start.setHours(0, 0, 0, 0)
  const recent = (S.workouts || []).filter(w => new Date(w.d + 'T12:00:00') >= start && new Date(w.d + 'T12:00:00') <= end)
  let planned = 0, completed = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = isoOf(d)
    const ids = effectiveRoutineIds(S, iso)
    planned += ids.length
    const done = new Set(recent.filter(w => w.d === iso).map(w => w.routineId))
    completed += ids.filter(id => done.has(id)).length
  }
  const workload = recent.reduce((n, w) => n + Math.max(0, Number(w.durationMin) || Math.round(((w.end || 0) - (w.start || 0)) / 60000)) * Math.max(1, Number(w.intensity) || 5), 0)
  const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 28)
  const previous = (S.workouts || []).filter(w => { const d = new Date(w.d + 'T12:00:00'); return d >= previousStart && d < start })
    .reduce((n, w) => n + Math.max(0, Number(w.durationMin) || Math.round(((w.end || 0) - (w.start || 0)) / 60000)) * Math.max(1, Number(w.intensity) || 5), 0)
  const readiness = Object.entries(S.readiness || {}).filter(([d]) => new Date(d + 'T12:00:00') >= start).map(([, r]) => (r.sleep + r.energy + (6 - r.soreness)) / 3)
  const readinessAvg = readiness.length ? readiness.reduce((a, b) => a + b, 0) / readiness.length : null
  const climbing = recent.filter(w => w.kind === 'activity' && /climb|boulder/i.test(w.activityType || w.name || ''))
  const bestGrade = climbing.map(w => w.grade).filter(Boolean).at(-1) || null
  return { recent, planned, completed, adherence: planned ? Math.round(completed / planned * 100) : null, workload, workloadChange: previous ? Math.round((workload - previous) / previous * 100) : null, readinessAvg, climbing, bestGrade }
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
  for (const w of S.workouts || []) {
    if (w.kind === 'activity') {
      if (w.durationMin) out.push({ type: 'Longest activity', value: `${w.durationMin} min`, score: w.durationMin, date: w.d })
      if (w.sends) out.push({ type: 'Most climbing sends', value: String(w.sends), score: w.sends, date: w.d })
      if (w.flashes) out.push({ type: 'Most climbing flashes', value: String(w.flashes), score: w.flashes, date: w.d })
    }
    for (const e of w.entries || []) for (const s of e.sets || []) if (s.done) {
      if (s.sec) out.push({ type: 'Longest timed hold', value: `${s.sec}s`, score: s.sec, date: w.d })
      if (s.reps && s.w) out.push({ type: 'Heaviest completed set', value: `${s.w} ${S.unit} × ${s.reps}`, score: s.w, date: w.d })
    }
  }
  return [...new Map(out.sort((a, b) => b.score - a.score).map(x => [x.type, x])).values()]
}
