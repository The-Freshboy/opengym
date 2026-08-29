import { isoOf, uid, todayISO } from './format.js'
import { effectiveRoutineIds, routineIds, setDayRoutineIds } from './history.js'

export const ACTIVITY_TYPES = ['Climbing', 'Hiking', 'Running', 'Cycling', 'Swimming', 'Sport', 'Mobility', 'Recovery', 'Other']

export function clearFutureDayOverrides(S, weekdays, fromIso = todayISO()) {
  const days = new Set([].concat(weekdays).map(Number))
  Object.keys(S.dayPlan || {}).forEach(iso => {
    if (iso >= fromIso && days.has(new Date(iso + 'T12:00:00').getDay())) delete S.dayPlan[iso]
  })
}

export function makeActivity(input, now = Date.now()) {
  const durationMin = Math.max(1, Math.round(Number(input.durationMin) || 1))
  const end = input.d ? new Date(input.d + 'T12:00:00').getTime() + durationMin * 60000 : now
  return {
    id: uid(), kind: 'activity', d: input.d, start: end - durationMin * 60000, end,
    name: String(input.name || input.type || 'Activity').trim().slice(0, 80),
    activityType: input.type || 'Other', durationMin,
    intensity: Math.min(10, Math.max(1, Number(input.intensity) || 5)),
    ...(Number(input.bw) > 0 ? { bw: Number(input.bw) } : {}),
    ...(input.location?.trim() ? { location: input.location.trim().slice(0, 120) } : {}),
    ...(input.grade?.trim() ? { grade: input.grade.trim().slice(0, 80) } : {}),
    ...(/climb|boulder/i.test(input.type || '') ? {
      attempts: Math.max(0, Math.round(Number(input.attempts) || 0)),
      sends: Math.max(0, Math.round(Number(input.sends) || 0)),
      flashes: Math.max(0, Math.round(Number(input.flashes) || 0)),
      style: String(input.style || '').trim().slice(0, 40)
    } : {}),
    ...(Number(input.distance) > 0 ? { distance: Number(input.distance) } : {}),
    ...(input.note?.trim() ? { note: input.note.trim().slice(0, 1000) } : {}),
    entries: [], prs: [], vol: 0
  }
}

export function moveWeeklyRoutine(S, fromDay, toDay, routineId) {
  if (fromDay === toDay || !routineIds(S.week[fromDay]).includes(routineId)) return false
  const from = routineIds(S.week[fromDay]).filter(id => id !== routineId)
  const to = [...routineIds(S.week[toDay]), routineId]
  if (from.length) S.week[fromDay] = from; else delete S.week[fromDay]
  S.week[toDay] = [...new Set(to)]
  clearFutureDayOverrides(S, [fromDay, toDay])
  return true
}

export function shiftRemainingWeek(S, fromIso, days = 1) {
  const start = new Date(fromIso + 'T12:00:00')
  const end = new Date(start); end.setDate(end.getDate() + (7 - ((end.getDay() + 6) % 7) - 1))
  const snapshots = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = isoOf(d); snapshots.push([iso, effectiveRoutineIds(S, iso)])
  }
  snapshots.forEach(([iso]) => setDayRoutineIds(S, iso, []))
  snapshots.forEach(([iso, ids]) => {
    if (!ids.length) return
    const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days)
    const target = isoOf(d)
    setDayRoutineIds(S, target, [...effectiveRoutineIds(S, target), ...ids])
  })
}

export function missedSessions(S, today) {
  const out = []
  const start = new Date(today + 'T12:00:00'); start.setDate(start.getDate() - 14)
  for (let d = start; isoOf(d) < today; d.setDate(d.getDate() + 1)) {
    const iso = isoOf(d)
    const completed = new Set((S.workouts || []).filter(w => w.d === iso).map(w => w.routineId).filter(Boolean))
    effectiveRoutineIds(S, iso).filter(id => !completed.has(id)).forEach(id => out.push({ iso, routineId: id }))
  }
  return out
}
