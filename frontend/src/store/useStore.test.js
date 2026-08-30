import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: request }))
vi.mock('../lib/exercises.js', () => ({ registerCustom: vi.fn() }))
vi.mock('../lib/format.js', () => ({ localTZ: () => 'Australia/Adelaide' }))
vi.mock('../lib/demo.js', () => ({ DEMO: false, DEMO_SEEDED: 'demo' }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, nativeLoad: vi.fn(), nativeSave: vi.fn(), syncReminder: vi.fn() }))
let store, defaults
const copy = x => JSON.parse(JSON.stringify(x))
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); request.mockReset()
  const memory = new Map()
  vi.stubGlobal('localStorage', { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) })
  vi.stubGlobal('document', { addEventListener: vi.fn() })
  const module = await import('./useStore.js'); store = module.useStore; defaults = module.DEF
  store.getState().setUser({ id: 'owner' })
  store.getState().replaceState({ ...copy(defaults), routines: [{ id: 'a', name: 'Original', ex: [] }], _ts: 10 }, false)
  localStorage.setItem('gym_server_revision', '5')
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('store sync workflow', () => {
  it('does not PUT or alter a revision when idle local active:null is omitted by the server', async () => {
    const { active, ...server } = copy(store.getState().S)
    request.mockResolvedValue({ state: server, revision: 5 })
    await store.getState().pullState()
    expect(request).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('gym_server_revision')).toBe('5')
    expect(store.getState().syncStatus).toBe('synced')
  })
  it('marks edits dirty before the debounce and preserves both offline branches', async () => {
    store.getState().update(s => { s.routines[0].name = 'Laptop edit' })
    expect(localStorage.getItem('gym_dirty')).toBe('1')
    const server = { ...copy(defaults), routines: [{ id: 'a', name: 'Phone edit' }], _ts: 20 }
    request.mockResolvedValue({ state: server, revision: 6 })
    await store.getState().pullState()
    await vi.advanceTimersByTimeAsync(1600)
    expect(request).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('gym_server_revision')).toBe('5')
    expect(store.getState().syncConflict.local.routines[0].name).toBe('Laptop edit')
    expect(store.getState().syncConflict.server.state.routines[0].name).toBe('Phone edit')
  })
  it('resolves local using the latest device edit and retains the previous branches', async () => {
    store.setState({ syncConflict: { local: copy(store.getState().S), server: { state: { routines: [] }, revision: 6 } } })
    store.getState().update(s => { s.routines[0].name = 'Latest local edit' })
    store.getState().resolveSyncConflict('local')
    expect(store.getState().S.routines[0].name).toBe('Latest local edit')
    expect(JSON.parse(localStorage.getItem('gym_last_resolved_conflict')).server.revision).toBe(6)
    expect(localStorage.getItem('gym_server_revision')).toBe('6')
  })
  it('ignores a late pull after logout/profile switch', async () => {
    let finish
    request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = store.getState().pullState()
    store.getState().setUser(null)
    finish({ state: { routines: [{ id: 'remote' }] }, revision: 8 })
    await pending
    expect(store.getState().S.routines[0].id).toBe('a')
    expect(localStorage.getItem('gym_server_revision')).toBeNull()
  })
  it('keeps local edits made during an approved server change as a conflict', async () => {
    let finish
    request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = store.getState().approveIntegrationProposal({ id: 'p', revision: 5, localState: JSON.stringify(store.getState().S) })
    const rejected = expect(pending).rejects.toThrow('Resolve both copies')
    store.getState().update(s => { s.routines[0].name = 'Edit during approval' })
    finish({ state: { ...copy(defaults), routines: [{ id: 'approved' }] }, revision: 6 })
    await rejected
    expect(store.getState().S.routines[0].name).toBe('Edit during approval')
    expect(store.getState().syncConflict.server.revision).toBe(6)
  })
  it('installs a snapshot through the same guarded approval path', async () => {
    request.mockResolvedValue({ state: { ...copy(defaults), routines: [{ id: 'restored' }] }, revision: 6 })
    await store.getState().restoreSnapshot({ id: 'recent-test', revision: 5, localState: JSON.stringify(store.getState().S) })
    expect(request.mock.calls[0][0]).toBe('/api/data/snapshots/restore')
    expect(JSON.parse(request.mock.calls[0][1].body).baseRevision).toBe(5)
    expect(store.getState().S.routines[0].id).toBe('restored')
  })
  it('keeps a failed push and refuses to clear unsynced data at sign-out', async () => {
    request.mockRejectedValue(new Error('Offline'))
    await expect(store.getState().signOut()).rejects.toThrow('not synced')
    expect(store.getState().user.id).toBe('owner')
    expect(store.getState().syncStatus).toBe('error')
    expect(localStorage.getItem('gym_dirty')).toBe('1')
  })
})
