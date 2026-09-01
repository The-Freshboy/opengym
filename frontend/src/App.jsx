import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { setLang, t, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { useWakeLock } from './lib/wakelock.js'
import Icon from './components/Icon.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login from './views/Login.jsx'
import { syncLabel } from './lib/sync-state.js'
import './personal.css'

const Home = lazy(() => import('./views/Home.jsx'))
const Personal = lazy(() => import('./views/Personal.jsx'))
const HangTimer = lazy(() => import('./views/HangTimer.jsx'))
const PhysioReport = lazy(() => import('./views/PhysioReport.jsx'))
const Plan = lazy(() => import('./views/Plan.jsx'))
const RoutineEdit = lazy(() => import('./views/RoutineEdit.jsx'))
const Workout = lazy(() => import('./views/Workout.jsx'))
const Stats = lazy(() => import('./views/Stats.jsx'))
const Insights = lazy(() => import('./views/Insights.jsx'))
const History = lazy(() => import('./views/History.jsx'))
const Library = lazy(() => import('./views/Library.jsx'))
const Settings = lazy(() => import('./views/Settings.jsx'))
const SyncRecovery = lazy(() => import('./views/SyncRecovery.jsx'))
const Integrations = lazy(() => import('./views/Integrations.jsx'))
const ReviewStatus = lazy(() => import('./views/ReviewStatus.jsx'))
const Admin = lazy(() => import('./views/Admin.jsx'))
const Coach = lazy(() => import('./views/Coach.jsx'))
const CoachIntake = lazy(() => import('./views/CoachIntake.jsx'))
const CoachProposal = lazy(() => import('./views/CoachProposal.jsx'))

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

function applyPrefs(theme, accent, accessibility) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = ACCENTS[accent] ? accent : 'lime'
  de.dataset.workoutAccessibility = accessibility?.workoutMode ? 'on' : 'off'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f2f2f7' : '#000000'
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready } = useStore()
  const syncStatus = useStore(s => s.syncStatus), syncConflict = useStore(s => s.syncConflict)
  const isGuest = useStore(s => s.isGuest())
  const editing = !!S.active?.editingWorkoutId
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs(S.theme, S.accent, S.accessibility) }, [S.theme, S.accent, S.accessibility?.workoutMode])
  useEffect(() => { setLang(S.lang || 'en') }, [S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(((!!S.active && !editing) || loc.pathname === '/personal/timer') && S.keepAwake !== false)

  const authed = user || isGuest
  if (!ready && !authed) return (
    <div id="app">
      <div style={{ paddingTop: '44vh', display: 'flex', justifyContent: 'center', fontSize: 34, color: 'var(--label-3)' }}>
        <Icon name="dumbbell" />
      </div>
    </div>
  )

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
      <div id="app" className="vfade" key={loc.pathname}>
        <ErrorBoundary>
          {authed && (!user || syncStatus === 'error' || syncStatus === 'pending' || syncConflict) && <button className="card small" style={{ width: '100%', padding: 10, textAlign: 'left' }} onClick={() => navigate(user ? '/settings/sync' : '/settings')}>{syncLabel({ user, syncStatus, syncConflict })}</button>}
          {!authed ? <Login /> : <Suspense fallback={<div className="empty">{t('Loading…')}</div>}>
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/personal" element={<Personal />} />
              <Route path="/personal/timer" element={<HangTimer />} />
              <Route path="/personal/export" element={<PhysioReport />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/sync" element={<SyncRecovery />} />
              <Route path="/settings/integrations" element={<Integrations />} />
              <Route path="/settings/reviews" element={<ReviewStatus />} />
              {/* The Coach screens gate themselves on the instance config; the routes exist
                  unconditionally so a deep link from a notification lands somewhere sane
                  rather than on the catch-all. */}
              <Route path="/coach" element={<Coach />} />
              <Route path="/coach/intake" element={<CoachIntake />} />
              <Route path="/coach/proposal" element={<CoachProposal />} />
              <Route path="/admin" element={user?.admin ? <Admin /> : <Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>}
        </ErrorBoundary>
      </div>
      <TabBar />
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return <HashRouter><Shell /></HashRouter>
}
