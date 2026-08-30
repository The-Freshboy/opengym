import { PLAN_FIELDS } from './backup-review.js'
import { samePersistedState } from './sync-state.js'

export const sameIntegrationState = samePersistedState

// Show every changed entity, not only the first few exercise names in a summary.
export function integrationChanges(before, after) {
  const out = []
  for (const field of PLAN_FIELDS) {
    const list = field === 'routines' || field === 'customEx'
    const left = list ? Object.fromEntries((before[field] || []).map(x => [x.id, x])) : before[field] || {}
    const right = list ? Object.fromEntries((after[field] || []).map(x => [x.id, x])) : after[field] || {}
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (sameIntegrationState(left[key], right[key])) continue
      out.push({ key: `${field}:${key}`, field, label: right[key]?.name || right[key]?.n || left[key]?.name || left[key]?.n || key,
        before: left[key], after: right[key] })
    }
  }
  return out
}
