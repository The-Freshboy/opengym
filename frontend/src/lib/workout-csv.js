// Portable completed-work export. No notes, feedback, health profile or credentials.
const cell = raw => {
  let value = String(raw ?? '')
  if (/^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value)) value = "'" + value
  return '"' + value.replaceAll('"', '""') + '"'
}
export function workoutCsv(S, names = {}) {
  const rows = [['Date', 'Session', 'Exercise/activity', 'Set', 'Type', 'Reps', 'Seconds', 'Minutes', 'Weight', 'Unit', 'Speed km/h', 'RIR', 'RPE', 'Equipment profile']]
  for (const w of S.workouts || []) {
    if (w.kind === 'activity') rows.push([w.d, w.name, w.activityType, '', 'activity', '', '', w.durationMin, '', '', '', '', w.intensity, w.trainingContext?.equipmentProfile?.name])
    for (const e of w.entries || []) (e.sets || []).forEach((s, i) => {
      if (s.done) rows.push([w.d, w.name, names[e.id] || e.id, i + 1, s.type || 'working', s.r, s.sec, s.min, s.w, w.unit || `${S.unit || 'kg'} (assumed)`, s.speed, s.rir, s.rpe, w.trainingContext?.equipmentProfile?.name])
    })
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
}
