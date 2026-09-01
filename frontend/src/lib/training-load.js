import { exOr } from './exercises.js'
import { weekKey } from './format.js'

export function weeklyTrainingLoad(workouts, limit = 8) {
  const weeks = new Map()
  for (const workout of workouts || []) {
    if (workout.copiedHistory) continue
    const key = weekKey(workout.d)
    const row = weeks.get(key) || { week: key, sessions: 0, workingSets: 0, cardioMinutes: 0, hangs: 0, climbing: 0 }
    row.sessions++
    if (workout.kind === 'activity') {
      row.cardioMinutes += Number(workout.durationMin) || 0
      if (/climb|boulder/i.test(workout.activityType || workout.name || '')) row.climbing++
    }
    for (const entry of workout.entries || []) {
      const working = (entry.sets || []).filter(s => s.done && s.type !== 'warmup')
      row.workingSets += working.length
      if (exOr(entry.id).bp === 'cardio') row.cardioMinutes += working.reduce((n, s) => n + (Number(s.min) || 0), 0)
      row.hangs += working.filter(s => Number(s.sec) > 0).length
    }
    weeks.set(key, row)
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-limit)
}

export function loadObservations(rows) {
  if (rows.length < 2) return []
  const previous = rows.at(-2), current = rows.at(-1), out = []
  for (const [key, label] of [['sessions', 'sessions'], ['workingSets', 'working sets'], ['cardioMinutes', 'cardio minutes'], ['hangs', 'timed holds']]) {
    if (!previous[key] && current[key]) out.push(`${label} resumed after none were logged in the previous week`)
    else if (previous[key] && current[key] >= previous[key] * 1.5 && current[key] - previous[key] >= 2) out.push(`${label} increased from ${previous[key]} to ${current[key]}`)
  }
  return out
}
