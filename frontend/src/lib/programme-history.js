import { samePersistedState } from './sync-state.js'

const plan = S => ({ routines: S.routines || [], week: S.week || {}, dayPlan: S.dayPlan || {}, customEx: S.customEx || [] })
const localDay = at => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
// Keep bounded, dated snapshots of planning intent, not workout/health history.
export function recordProgrammeChange(before, after, at = new Date().toISOString()) {
  if (samePersistedState(plan(before), plan(after))) return false
  const previous = JSON.parse(JSON.stringify(plan(before)))
  after.programmeHistory = [...(before.programmeHistory || []).slice(-9), { at, effectiveDate: localDay(at), previous,
    changedDates: [...new Set([...Object.keys(before.dayPlan || {}), ...Object.keys(after.dayPlan || {})])].filter(date => JSON.stringify(before.dayPlan?.[date]) !== JSON.stringify(after.dayPlan?.[date])) }]
  return true
}

export function plannedStateAt(S, date) {
  // Date-only edits apply from that date; never pretend we know intent before tracking began.
  const future = (S.programmeHistory || []).filter(v => (v.effectiveDate || v.at?.slice(0, 10)) > date).sort((a, b) => a.at.localeCompare(b.at))
  return future[0]?.previous ? { ...S, ...future[0].previous } : S
}
