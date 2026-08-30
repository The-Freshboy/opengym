// Only the root active workout and transport timestamp are device-only metadata.
// Nested fields with those names remain meaningful training data.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
export function persistedState(state) {
  if (!state || typeof state !== 'object') return state
  const { active, _ts, ...saved } = state
  return canonical(saved)
}
export const samePersistedState = (a, b) => JSON.stringify(persistedState(a)) === JSON.stringify(persistedState(b))

export function syncDecision({ local, server, dirty, baseRevision, revision, defaults = {}, hasLocalData }) {
  if (!server) return hasLocalData ? 'push-new' : 'adopt'
  if (samePersistedState({ ...defaults, ...local }, { ...defaults, ...server })) return 'equal'
  // A clean acknowledged branch can safely take the server. Unknown legacy branches
  // with newer local timestamps need an explicit choice, not timestamp-based overwrite.
  const localChanges = dirty || (hasLocalData && (baseRevision == null || (local._ts || 0) > (server._ts || 0)))
  if (!localChanges) return 'adopt'
  return baseRevision != null && baseRevision === revision ? 'push' : 'conflict'
}

export function syncLabel({ user, syncStatus, syncConflict }) {
  if (!user) return 'Guest — saved on this device only'
  if (syncConflict) return 'Conflict — both copies need review'
  return ({ synced: 'Synced to your profile', pending: 'Saved on this device — waiting to sync', syncing: 'Syncing…', error: 'Saved on this device — sync failed', unknown: 'Signed in — sync not yet verified' })[syncStatus] || 'Sync not yet verified'
}
