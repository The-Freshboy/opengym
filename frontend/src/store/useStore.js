import { create } from 'zustand'
import { api } from '../lib/api.js'
import { localTZ } from '../lib/format.js'
import { registerCustom } from '../lib/exercises.js'
import { DEMO, DEMO_SEEDED } from '../lib/demo.js'
import { MOBILE, nativeLoad, nativeSave, syncReminder } from '../lib/mobile.js'
import { syncDecision } from '../lib/sync-state.js'
import { recordProgrammeChange } from '../lib/programme-history.js'

const KEY = 'gym_state_v1'
const REV_KEY = 'gym_server_revision'
const CONFLICT_KEY = 'gym_sync_conflict'
export const DEF = {
  unit: 'kg', restSec: 90, sound: true, haptics: true, keepAwake: true, lang: 'en',
  theme: 'dark', accent: 'lime', body: 'male', targetW: null,
  bodyweight: [], routines: [], week: {}, dayPlan: {},
  exWeights: {}, workouts: [], active: null, customEx: [], readiness: {}, trainingBlocks: [], favoriteEx: [], homeShortcuts: ['activity', 'readiness'], calendarView: 'month', calendarFilters: ['completed', 'planned', 'activities', 'missed'],
  // effort: which per-set effort scale is logged — 'none' | 'rir' | 'rpe'. null, not 'none', so
  // that a profile which never chose (loaded state is overlaid on DEF, on every path: local,
  // server pull, backup import) still falls back to the `showRir` boolean this replaced and
  // keeps the column it had. See effortOf.
  reminder: { on: false, time: '08:00', tz: null }, effort: null,
  // AI Coach (issue: AI enablement). null until the profile opts in — a null namespace is the
  // same app it was before the feature existed, which is what Epic F asks for. Shape and
  // bounds live in lib/coach.js.
  coach: null,
  goals: [], goalResults: [], personal: { weeklySummary: false }, accessibility: { workoutMode: false, voiceCues: false }
}
const clone = o => JSON.parse(JSON.stringify(o))

function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return Object.assign(clone(DEF), JSON.parse(raw))
  } catch (e) { /* ignore */ }
  return clone(DEF)
}

const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

export const useStore = create((set, get) => {
  let pushTm = null
  let saveTm = null
  let pushFlight = null
  let integrationApplying = false
  let sessionEpoch = 0

  // Mobile build: mirror the state into a file in the app's data directory (survives WebView
  // storage eviction) and keep the native reminder schedule in step with the weekly plan.
  const nativePersist = () => {
    clearTimeout(saveTm)
    saveTm = setTimeout(() => { saveTm = null; nativeSave(get().S); syncReminder(get().S) }, 800)
  }

  const persist = (S, push = true) => {
    if (push) S._ts = Date.now()
    registerCustom(S.customEx)
    try { localStorage.setItem(KEY, JSON.stringify(S)) }
    catch (e) { set({ localSaveError: 'Browser storage rejected the latest change' }); throw e }
    set({ S, localSaveError: null, lastLocalSaveAt: new Date().toISOString() })
    if (MOBILE) nativePersist()
    if (push && get().user) {
      localStorage.setItem('gym_dirty', '1')
      set({ syncStatus: 'pending', syncError: null })
      clearTimeout(pushTm)
      pushTm = setTimeout(() => get().pushState(), 1500)
    }
  }

  // A setting changed right before switching away/closing the tab must not get lost mid-debounce
  // (e.g. setting the reminder time then immediately backgrounding to test it). On mobile the
  // same applies to the file mirror — backgrounding is often the last thing before the OS
  // kills the app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    if (MOBILE && saveTm) {
      clearTimeout(saveTm)
      saveTm = null
      nativeSave(get().S)
    }
    if (pushTm) {
      clearTimeout(pushTm)
      pushTm = null
      get().pushState()
    }
  })

  // Everything a sign-out leaves behind on this device, whichever way it was triggered.
  const clearLocalSession = () => {
    get().setUser(null)
    localStorage.removeItem('gym_guest')
    localStorage.removeItem('gym_dirty')
    localStorage.removeItem(REV_KEY)
    localStorage.removeItem(CONFLICT_KEY)
    localStorage.removeItem(KEY)
    localStorage.removeItem('gym_before_full_restore')
    localStorage.removeItem('gym_reviewed_plan_recovery')
    localStorage.removeItem('gym_last_resolved_conflict')
    persist(clone(DEF), false)
  }

  return {
    S: (() => { const s = loadState(); registerCustom(s.customEx); return s })(),
    undoState: null,
    user: (() => { try { return JSON.parse(localStorage.getItem('gym_user')) || null } catch { return null } })(),
    ready: false,
    syncStatus: 'unknown', syncError: null, lastSyncedAt: null,
    localSaveError: null, lastLocalSaveAt: null,
    syncConflict: (() => { try { return JSON.parse(localStorage.getItem(CONFLICT_KEY)) || null } catch { return null } })(),
    // Instance capabilities from GET /api/config. `config.coach` is present only when the
    // owner has both enabled the Coach and connected a provider — every Coach entry point in
    // the app hangs off it, so an unconfigured instance renders exactly what it always did.
    config: null,

    // Mutate a draft of S via producer fn, then persist + schedule sync.
    update(mut, push = true) {
      const S = clone(get().S)
      const before = clone(S)
      mut(S)
      recordProgrammeChange(before, S)
      set({ undoState: before })
      persist(S, push)
    },
    undo() {
      const prev = get().undoState
      if (!prev) return false
      const current = clone(get().S)
      persist(clone(prev), true)
      set({ undoState: current })
      return true
    },
    replaceState(S, push = false) { persist(clone(S), push) },

    isGuest: () => localStorage.getItem('gym_guest') === '1',
    setGuest(v) { if (v) localStorage.setItem('gym_guest', '1'); else localStorage.removeItem('gym_guest'); set({}) },

    setUser(u) {
      if (get().user?.id !== u?.id) {
        sessionEpoch++
        clearTimeout(pushTm); pushTm = null
        localStorage.removeItem(REV_KEY)
        localStorage.removeItem(CONFLICT_KEY)
        set({ syncConflict: null, syncStatus: 'unknown', syncError: null, lastSyncedAt: null })
      }
      if (u) { localStorage.setItem('gym_user', JSON.stringify(u)); localStorage.removeItem('gym_guest') }
      else localStorage.removeItem('gym_user')
      set({ user: u })
    },

    async pushState() {
      if (!get().user) return
      if (get().syncConflict) return
      clearTimeout(pushTm)
      pushTm = null
      if (integrationApplying) { localStorage.setItem('gym_dirty', '1'); return }
      if (pushFlight) return pushFlight
      const pushedUser = get().user.id
      const pushedEpoch = sessionEpoch
      const pushedState = JSON.stringify(get().S)
      set({ syncStatus: 'syncing', syncError: null })
      pushFlight = (async () => {
      try {
        const raw = localStorage.getItem(REV_KEY)
        const baseRevision = raw == null ? null : Number(raw)
        const result = await api('/api/data', { method: 'PUT', body: JSON.stringify({ state: JSON.parse(pushedState), baseRevision }) })
        if (get().user?.id !== pushedUser || sessionEpoch !== pushedEpoch) return
        localStorage.setItem(REV_KEY, String(result.revision))
        if (JSON.stringify(get().S) === pushedState) localStorage.removeItem('gym_dirty')
        else { localStorage.setItem('gym_dirty', '1'); pushTm = setTimeout(() => get().pushState(), 1500) }
        localStorage.removeItem(CONFLICT_KEY)
        set({ syncConflict: null, syncStatus: localStorage.getItem('gym_dirty') === '1' ? 'pending' : 'synced', lastSyncedAt: new Date().toISOString() })
      } catch (e) {
        if (get().user?.id !== pushedUser || sessionEpoch !== pushedEpoch) return
        localStorage.setItem('gym_dirty', '1')
        set({ syncStatus: 'error', syncError: e.message || 'Connection failed' })
        if (e.status === 409 && e.data?.current) {
          const conflict = { detectedAt: new Date().toISOString(), local: clone(get().S), server: e.data.current }
          localStorage.setItem(CONFLICT_KEY, JSON.stringify(conflict))
          set({ syncConflict: conflict })
        }
      }
      })()
      try { await pushFlight } finally { pushFlight = null }
    },

    // Server approval is a revision-checked mutation. Pause debounced pushes until its
    // result is installed; if local edits occur meanwhile, retain both copies for review.
    approveIntegrationProposal(args) { return get().applyReviewedServerChange({ ...args, kind: 'proposal' }) },
    restoreSnapshot(args) { return get().applyReviewedServerChange({ ...args, kind: 'snapshot' }) },
    async applyReviewedServerChange({ id, revision, localState, kind }) {
      if (!get().user || integrationApplying) throw new Error('Sign in and wait for the current request to finish.')
      clearTimeout(pushTm); pushTm = null
      if (pushFlight) await pushFlight
      if (get().syncConflict || localStorage.getItem('gym_dirty') === '1' || get().S.active || JSON.stringify(get().S) !== localState) {
        throw new Error('Your data changed or is not synced. Open the proposal review again.')
      }
      integrationApplying = true
      const userId = get().user.id
      const approvalEpoch = sessionEpoch
      try {
        const result = await api(kind === 'snapshot' ? '/api/data/snapshots/restore' : '/api/integrations/proposals/approve', { method: 'POST', body: JSON.stringify(kind === 'snapshot' ? { id, baseRevision: revision } : { id, revision }) })
        if (get().user?.id !== userId || sessionEpoch !== approvalEpoch) throw new Error('The profile changed. Sign in to the original profile to see its updated programme.')
        if (JSON.stringify(get().S) !== localState) {
          const conflict = { detectedAt: new Date().toISOString(), local: clone(get().S), server: result }
          localStorage.setItem(CONFLICT_KEY, JSON.stringify(conflict)); localStorage.setItem('gym_dirty', '1')
          set({ syncConflict: conflict })
          throw new Error('The server change was applied, but this device changed meanwhile. Resolve both copies in Sync & recovery.')
        }
        localStorage.setItem(REV_KEY, String(result.revision))
        localStorage.removeItem('gym_dirty')
        const next = Object.assign(clone(DEF), result.state)
        const recorded = recordProgrammeChange(get().S, next)
        persist(next, recorded)
        set({ undoState: null, syncStatus: recorded ? 'pending' : 'synced', lastSyncedAt: new Date().toISOString() })
        return result
      } finally { integrationApplying = false }
    },
    async pullState() {
      if (!get().user || integrationApplying) return
      if (pushFlight) await pushFlight
      const userId = get().user?.id
      const pullEpoch = sessionEpoch
      if (!userId || get().syncConflict) return
      set({ syncStatus: 'syncing', syncError: null })
      try {
        const { state, revision } = await api('/api/data')
        if (get().user?.id !== userId || sessionEpoch !== pullEpoch || integrationApplying || get().syncConflict) return
        // A GET started before a later successful PUT must not roll its revision back.
        const acknowledged = localStorage.getItem(REV_KEY)
        if (acknowledged != null && revision < Number(acknowledged)) return
        const S = get().S
        const dirty = localStorage.getItem('gym_dirty') === '1'
        const raw = localStorage.getItem(REV_KEY)
        const action = syncDecision({ local: S, server: state, dirty, baseRevision: raw == null ? null : Number(raw), revision: revision || 0, defaults: DEF, hasLocalData: hasData(S) })
        if (action === 'conflict') {
          const conflict = { detectedAt: new Date().toISOString(), local: clone(S), server: { state, revision } }
          localStorage.setItem(CONFLICT_KEY, JSON.stringify(conflict))
          localStorage.setItem('gym_dirty', '1')
          set({ syncConflict: conflict, syncStatus: 'pending' })
          return
        }
        if (action === 'push') { await get().pushState(); return }
        localStorage.setItem(REV_KEY, String(revision || 0))
        if (action === 'push-new') { await get().pushState(); return }
        if (action === 'adopt' && state) {
          const active = S.active
          const next = Object.assign(clone(DEF), state)
          if (active) next.active = active
          persist(next, false)
        }
        localStorage.removeItem('gym_dirty')
        set({ syncStatus: 'synced', lastSyncedAt: new Date().toISOString() })
      } catch (e) { if (get().user?.id === userId && sessionEpoch === pullEpoch) set({ syncStatus: 'error', syncError: e.message || 'Connection failed' }) }
    },

    resolveSyncConflict(choice) {
      const conflict = get().syncConflict
      if (!conflict) return
      if (get().S.active) throw new Error('Save or finish your active workout before resolving a conflict.')
      // Preserve both branches locally as well as the server's automatic snapshot.
      localStorage.setItem('gym_last_resolved_conflict', JSON.stringify({ ...conflict, local: clone(get().S) }))
      if (choice === 'server') {
        localStorage.setItem(REV_KEY, String(conflict.server.revision || 0))
        localStorage.removeItem('gym_dirty')
        localStorage.removeItem(CONFLICT_KEY)
        persist(Object.assign(clone(DEF), conflict.server.state || {}), false)
        set({ syncConflict: null, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() })
      } else {
        localStorage.setItem(REV_KEY, String(conflict.server.revision || 0))
        localStorage.removeItem(CONFLICT_KEY)
        set({ syncConflict: null })
        persist(clone(get().S), true)
      }
    },

    async signOut() {
      await get().pushState()
      if (get().syncConflict || localStorage.getItem('gym_dirty') === '1') throw new Error('Your changes are not synced. Export a backup or resolve syncing before signing out.')
      await api('/api/logout', { method: 'POST', body: '{}' })
      clearLocalSession()
    },

    // "Sign out everywhere": the server bumps this profile's session version, which kills every
    // session it has on any device — this browser included, so the app has to end up exactly
    // where a normal signOut leaves it. Unlike signOut the request is NOT swallowed: if it fails
    // the sessions elsewhere are all still valid, and wiping this device's copy of the data
    // would sign the user out of the one place the bump didn't reach. Caller reports the error.
    async signOutAll() {
      await get().pushState()   // never throws — stores gym_dirty and moves on when offline
      if (get().syncConflict || localStorage.getItem('gym_dirty') === '1') throw new Error('Resolve syncing or export your changes before signing out.')
      await api('/api/logout/all', { method: 'POST', body: '{}' })
      clearLocalSession()
    },

    // Demo build only: drop the seeded example profile back in (Settings → "Reset demo data").
    // Dynamic import so the generator never ships in a self-hosted bundle.
    async resetDemo() {
      const { buildDemoState } = await import('../lib/demoSeed.js')
      localStorage.removeItem('gym_dirty')
      persist(Object.assign(clone(DEF), buildDemoState()), false)
    },

    // Boot: ask the server who we are, then pull.
    async boot() {
      // Mobile build: no backend either — restore from the file mirror (the durable copy;
      // localStorage may have been evicted since the last run) and go straight in.
      if (MOBILE) {
        const saved = await nativeLoad()
        const S = get().S
        if (saved && (!hasData(S) || (saved._ts || 0) >= (S._ts || 0))) {
          persist(Object.assign(clone(DEF), saved), false)
        } else if (hasData(S)) {
          nativeSave(S)   // first run after an update from a file-less version: seed the mirror
        }
        get().setGuest(true)
        syncReminder(get().S)
        set({ ready: true })
        return
      }
      // Demo build (GitHub Pages): no backend at all — seed once, stay in guest mode.
      if (DEMO) {
        if (!localStorage.getItem(DEMO_SEEDED)) {
          localStorage.setItem(DEMO_SEEDED, '1')
          await get().resetDemo()
        }
        get().setGuest(true)
        set({ ready: true })
        return
      }
      // Instance capabilities are public and needed whether or not anyone is signed in.
      try { set({ config: await api('/api/config') }) } catch (e) { /* offline — assume nothing extra */ }
      try {
        const me = await api('/api/me')
        get().setUser(me.user)
        await get().pullState()
        // Re-stamp the reminder's timezone on every load — keeps it correct if you're travelling,
        // without needing to revisit Settings.
        const tz = localTZ()
        if (get().S.reminder?.on && get().S.reminder.timezoneMode !== 'home' && get().S.reminder.tz !== tz) {
          get().update(s => { s.reminder = { ...s.reminder, tz } })
        }
      } catch (e) {
        if (e.status === 401) get().setUser(null)
      }
      set({ ready: true })
    }
  }
})

export { hasData }
