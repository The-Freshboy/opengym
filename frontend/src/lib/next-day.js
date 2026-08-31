export function nextCalendarDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null
  const d = new Date(date + 'T12:00:00Z')
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export const symptomFields = ['jointDiscomfort', 'tingling', 'numbness', 'weakness']
export const nextDaySymptoms = report => report?.status === 'recorded' && symptomFields.some(k => report[k] === true)

export function checkInWorkouts(workouts, today) {
  return (workouts || []).filter(w => !w.copiedHistory && nextCalendarDate(w.d) === today)
}

export function saveNextDayCheckIn(state, workoutId, draft, today, timestamp = new Date().toISOString()) {
  const workout = state.workouts?.find(w => w.id === workoutId)
  if (!workout || workout.copiedHistory || nextCalendarDate(workout.d) !== today) throw new Error('This check-in is only available on the day after this workout.')
  if (!symptomFields.every(k => typeof draft[k] === 'boolean')) throw new Error('Please answer each symptom question, or leave the check-in for later.')
  if (!['better', 'same', 'worse', 'unsure'].includes(draft.change)) throw new Error('Choose how you feel compared with your usual baseline.')
  workout.nextDayCheckIn = {
    status: 'recorded', date: today, recordedAt: timestamp,
    ...Object.fromEntries(symptomFields.map(k => [k, draft[k]])),
    change: draft.change, note: String(draft.note || '').trim().slice(0, 1000)
  }
}
