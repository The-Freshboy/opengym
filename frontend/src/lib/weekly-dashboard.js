import { EXDB } from './exercises.js'

const positive = value => Number.isFinite(value) && value > 0 ? value : 0
const running = name => /\b(run|running|jog|jogging)\b/i.test(name) && !/\b(walk|walking)\b/i.test(name)
const climbing = name => /\b(climb|climbing|boulder|bouldering)\b/i.test(name)
const hanging = name => /\b(hang|hangs|hangboard|fingerboard|hangboarding|fingerboarding)\b/i.test(name)
const assistance = context => {
  if (['unassisted', 'assisted', 'unknown'].includes(context?.assistance)) return context.assistance
  const support = String(context?.support || '').trim().toLowerCase()
  if (/^(unassisted|none|no assistance|bodyweight)$/.test(support)) return 'unassisted'
  if (/^(assisted|feet supported|feet-supported|band assisted|band-assisted|machine assisted|machine-assisted)$/.test(support)) return 'assisted'
  return 'unknown'
}

// Report actual logged work only. Do not substitute prescriptions, workout clock
// duration or treadmill speed for missing running/hold measurements.
export function weeklyDashboard(S, today) {
  const end = new Date(today + 'T12:00:00Z'), start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  const from = start.toISOString().slice(0, 10)
  const previousStart = new Date(start); previousStart.setUTCDate(start.getUTCDate() - 7)
  const catalogue = new Map([...EXDB, ...(S.customEx || [])].map(e => [e.id, e]))
  const collect = (lo, hi, inclusive) => {
    const result = { sessions: 0, partial: 0, runningMinutes: 0, otherCardioMinutes: 0, climbingSessions: 0, hangs: [] }
    for (const w of S.workouts || []) {
      if (w.copiedHistory || !w.d || w.d < lo || (inclusive ? w.d > hi : w.d >= hi)) continue
      const entries = (w.kind === 'activity' ? [] : w.entries || []).filter(e => e.sets?.some(s => s.done))
      if (w.kind !== 'activity' && !entries.length) continue
      if (w.incomplete) result.partial++; else result.sessions++
      let isClimbing = w.kind === 'activity' && climbing(w.activityType || w.name || '')
      if (w.kind === 'activity' && running(w.activityType || w.name || '')) result.runningMinutes += positive(w.durationMin)
      else if (w.kind === 'activity' && /^(cycling|swimming|hiking)$/i.test(w.activityType || '')) result.otherCardioMinutes += positive(w.durationMin)
      for (const e of entries) {
        const name = catalogue.get(e.id)?.n || e.target?.name || e.name || ''
        const sets = e.sets.filter(s => s.done)
        if (climbing(name)) isClimbing = true
        const mins = sets.reduce((n, s) => n + positive(s.min), 0)
        if (running(name)) result.runningMinutes += mins
        else if (!climbing(name)) result.otherCardioMinutes += mins
        if (hanging(name)) {
          for (const s of sets.filter(s => s.type !== 'warmup' && positive(s.sec))) result.hangs.push({
            name, id: e.id, seconds: s.sec, assistance: assistance(e.hangContext), context: e.hangContext || {},
            load: s.w ?? null, unit: w.unit || '', equipment: w.trainingContext?.equipmentProfile?.name || '',
            // Keep distinct grips, supports, equipment and added loads separate.
            key: JSON.stringify([e.id, assistance(e.hangContext), e.hangContext || {}, s.w ?? null, w.unit || '', w.trainingContext?.equipmentProfile || null]),
          })
        }
      }
      if (isClimbing) result.climbingSessions++
    }
    return result
  }
  const current = collect(from, today, true), previous = collect(previousStart.toISOString().slice(0, 10), from, false)
  const grouped = new Map()
  for (const h of current.hangs) {
    const row = grouped.get(h.key) || { ...h, count: 0, best: 0, previousBest: null }
    row.count++; row.best = Math.max(row.best, h.seconds); grouped.set(h.key, row)
  }
  for (const h of previous.hangs) {
    const row = grouped.get(h.key)
    if (row && row.assistance !== 'unknown' && ['hold', 'grip', 'support', 'elbow'].every(k => String(row.context[k] || '').trim())) row.previousBest = Math.max(row.previousBest || 0, h.seconds)
  }
  return { ...current, from, to: today, hangGroups: [...grouped.values()], previous }
}
