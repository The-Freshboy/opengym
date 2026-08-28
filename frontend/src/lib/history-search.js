import { exOr } from './exercises.js'

export function filterHistory(records, query = '', kind = 'all') {
  const q = query.trim().toLowerCase()
  return [...(records || [])].reverse().filter(w => {
    if (kind === 'workouts' && w.kind === 'activity') return false
    if (kind === 'activities' && w.kind !== 'activity') return false
    if (kind === 'incomplete' && !w.incomplete) return false
    if (!q) return true
    const exerciseNames = (w.entries || []).map(e => exOr(e.id).n).join(' ')
    return [w.name, w.activityType, w.location, w.note, exerciseNames]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  })
}
