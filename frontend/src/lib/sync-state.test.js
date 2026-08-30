import { describe, expect, it } from 'vitest'
import { samePersistedState, syncDecision, syncLabel } from './sync-state.js'

describe('persisted state contract', () => {
  it('ignores root device state but preserves nested training fields', () => {
    expect(samePersistedState({ routines: [], active: null, _ts: 2 }, { routines: [], _ts: 1 })).toBe(true)
    expect(samePersistedState({ routines: [{ active: true }] }, { routines: [{ active: false }] })).toBe(false)
  })
  const local = { routines: [{ id: 'local' }], _ts: 20 }
  const server = { routines: [{ id: 'phone' }], _ts: 10 }
  const branch = { local, server, dirty: true, hasLocalData: true, baseRevision: 5, revision: 6 }
  it('never acknowledges a phone edit on behalf of a dirty offline branch', () => {
    expect(syncDecision(branch)).toBe('conflict')
    expect(syncDecision({ ...branch, baseRevision: null })).toBe('conflict')
  })
  it('pushes only against the acknowledged unchanged base', () => {
    expect(syncDecision({ ...branch, revision: 5 })).toBe('push')
  })
  it('adopts a clean newer server and preserves equal idle proposals', () => {
    expect(syncDecision({ ...branch, local: { ...local, _ts: 1 }, dirty: false })).toBe('adopt')
    expect(syncDecision({ ...branch, local: { ...server, active: null } })).toBe('equal')
  })
  it('normalises new default fields when comparing an older server payload', () => {
    expect(syncDecision({ ...branch, local: { ...server, equipmentProfiles: [] }, defaults: { equipmentProfiles: [] } })).toBe('equal')
  })
  it('initialises a new profile without overwriting an existing one', () => {
    expect(syncDecision({ ...branch, server: null, revision: 0 })).toBe('push-new')
    expect(syncDecision({ ...branch, server: null, hasLocalData: false })).toBe('adopt')
  })
  it('does not claim a signed-in profile is synced before verification', () => {
    expect(syncLabel({ user: { id: 'u' }, syncStatus: 'error' })).toContain('sync failed')
    expect(syncLabel({ user: null })).toContain('Guest')
  })
})
