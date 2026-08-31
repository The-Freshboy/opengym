export function changeTimeline(state) {
  const rows = []
  for (const h of state.programmeHistory || []) rows.push({ at: h.at, type: 'programme', title: 'Programme edited', detail: h.changedDates?.length ? `Schedule changed for ${h.changedDates.length} dates.` : 'Routine, weekly schedule or exercise library changed.' })
  for (const h of state.setupHistory || []) rows.push({ at: h.at, type: 'equipment', title: `Setup saved · ${h.location}`, detail: h.note || 'Setup note cleared.', exerciseId: h.exerciseId })
  for (const w of state.workouts || []) {
    const at = w.end && Number.isFinite(new Date(w.end).getTime()) ? new Date(w.end).toISOString() : w.d + 'T12:00:00'
    if (w.note) rows.push({ at, type: 'comments', title: w.name || 'Workout comment', detail: w.note })
    for (const e of w.entries || []) if (e.note) rows.push({ at, type: 'comments', title: 'Exercise comment', detail: e.note, exerciseId: e.id })
    if (w.feedback && Object.keys(w.feedback).length) rows.push({ at, type: 'check-ins', title: `Session feedback · ${w.name || w.d}`, detail: Object.entries(w.feedback).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') })
    const n = w.nextDayCheckIn
    if (n?.status === 'recorded') rows.push({ at: n.recordedAt || n.date + 'T12:00:00', type: 'check-ins', title: 'Next-day check-in', detail: `${n.change} compared with usual baseline. ${n.note || ''}` })
  }
  return rows.filter(r => Number.isFinite(Date.parse(r.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 100)
}
