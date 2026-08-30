// Optional metadata never turns an exercise log into a clinical assessment.
export const isWorkingSet = s => !!s?.done && s.type !== 'warmup'
export const nerveSymptomsReported = f => ['tingling', 'numbness', 'weakness'].some(k => f?.[k] === true)
export function trainingContext(preferences = {}) {
  const profile = preferences.equipmentProfiles?.find(p => p.id === preferences.activeEquipmentProfileId)
  return { ...(profile ? { equipmentProfile: JSON.parse(JSON.stringify(profile)) } : {}), ...(preferences.sessionMinutes > 0 ? { plannedMinutes: preferences.sessionMinutes } : {}) }
}
export const equipmentKey = context => JSON.stringify(context?.equipmentProfile || null)
export function repCountLabel(reps, convention) {
  if (convention === 'per-side') return `${reps} each side`
  if (convention === 'total-both-sides') return `${reps} total${Number.isFinite(reps) && reps % 2 === 0 ? ` (${reps / 2} each side)` : ' across both sides'}`
  return String(reps)
}
export function duplicateKnownHistory(workout, date, today, id, confirmed) {
  if (!confirmed) throw new Error('Confirm this training actually occurred before copying completed history.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date || date > today) throw new Error('Choose a valid past or current date, not a future workout.')
  const copy = JSON.parse(JSON.stringify(workout))
  const duration = Math.max(60000, (workout.end || 0) - (workout.start || 0)), start = new Date(date + 'T12:00:00').getTime()
  for (const key of ['feedback', 'rating', 'sessionRpe', 'note']) delete copy[key]
  return { ...copy, id, d: date, start, end: start + duration, prs: [], copiedHistory: true, duplicatedFrom: workout.id }
}
export function editTrainingBlock(block, patch) {
  const result = { ...block, ...patch }
  if (!String(result.name || '').trim()) throw new Error('A block name is required.')
  result.name = result.name.trim().slice(0, 100)
  result.goal = String(result.goal || '').slice(0, 300)
  if (!Number.isInteger(Number(result.weeks)) || result.weeks < 1 || result.weeks > 16) throw new Error('Choose 1–16 weeks.')
  result.weeks = Number(result.weeks)
  return result
}
export function hangContextLabel(c) {
  if (!c) return ''
  return [['hold', 'Hold / edge'], ['grip', 'Grip'], ['support', 'Assistance'], ['elbow', 'Elbow position']]
    .filter(([key]) => typeof c[key] === 'string' && c[key].trim())
    .map(([key, label]) => `${label}: ${c[key].trim().slice(0, 120)}`).join('; ')
}
export function sessionLoad(w) {
  const duration = Number.isFinite(w.durationMin) ? w.durationMin : w.end > w.start ? (w.end - w.start) / 60000 : null
  const effort = w.sessionRpe ?? w.intensity
  return duration > 0 && Number.isFinite(effort) && effort >= 1 && effort <= 10 ? duration * effort : null
}
