import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import WeeklyDashboard from '../components/WeeklyDashboard.jsx'
import { todayISO } from '../lib/format.js'
import { GOAL_TEMPLATES, goalResults, goalReached, validateResult, weeklySummary } from '../lib/personal.js'

const resultLabel = (g, r) => !r ? 'Not tested' : g.kind === 'beep' ? `Level ${r.value}, shuttle ${r.shuttle}` : `${r.value} ${g.unit}`
function GoalCard({ goal }) {
  const { S, update } = useStore()
  const toast = useUI(s => s.toast)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ d: todayISO(), value: '', shuttle: '', standard: false, note: '', grip: 'underhand' })
  const rows = goalResults(S, goal)
  const latest = rows.at(-1)
  const summary = weeklySummary(S, todayISO())
  const current = goal.kind === 'climbing' ? { value: summary.climbing } : latest
  const save = e => {
    e.preventDefault()
    const record = { ...draft, value: draft.value === '' ? NaN : Number(draft.value), shuttle: draft.shuttle === '' ? NaN : Number(draft.shuttle), goalId: goal.id, id: crypto.randomUUID() }
    const error = validateResult(goal, record, todayISO()); if (error) return toast(error)
    if (goal.kind !== 'beep') delete record.shuttle
    if (goal.kind !== 'hang') { delete record.grip; delete record.standard }
    update(s => { s.goalResults ||= []; s.goalResults.push(record) })
    setOpen(false); setDraft({ d: todayISO(), value: '', shuttle: '', standard: false, note: '', grip: 'underhand' }); toast('Result saved')
  }
  const changeGoal = patch => update(s => { const g = s.goals.find(x => x.id === goal.id); if (g) Object.assign(g, patch) })
  return <section className="card personal-goal">
    <div className="row between"><h2>{goal.name}</h2>{goalReached(goal, current) && <span className="tag acc">Target reached</span>}</div>
    <div className="personal-result">{goal.kind === 'climbing' ? `${summary.climbing} this week` : resultLabel(goal, latest)}</div>
    <p className="small dim">{latest?.d ? `Latest test: ${latest.d}. ` : ''}{goal.kind === 'beep' ? `Target: level ${goal.target}, shuttle ${goal.targetShuttle}. No treadmill conversion.` : `Target: ${goal.target} ${goal.unit}.`}</p>
    <p className="small">{goal.protocol}</p>
    {goal.notBefore && todayISO() < goal.notBefore && <p className="small">Baseline testing available from {goal.notBefore}. Keep conditioning in your workout log.</p>}
    <details><summary>Edit target / deadline</summary><label>Target {goal.kind === 'beep' ? 'level' : `(${goal.unit})`}<input className="input" type="number" min="1" max="100000" value={goal.target} onChange={e => { const n = Number(e.target.value); if (n > 0 && n <= 100000 && (goal.kind !== 'beep' || (Number.isInteger(n) && n <= 21))) changeGoal({ target: n }) }} /></label>
      {goal.kind === 'beep' && <label>Target shuttle<input className="input" type="number" min="1" max="30" value={goal.targetShuttle} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 30) changeGoal({ targetShuttle: n }) }} /></label>}
      <label>Deadline (optional)<input className="input" type="date" value={goal.deadline || ''} onChange={e => changeGoal({ deadline: e.target.value })} /></label>
      <Button size="sm" onClick={() => changeGoal({ archived: true })}>Archive goal (keep results)</Button>
    </details>
    {goal.kind !== 'climbing' && <Button onClick={() => setOpen(!open)} disabled={!!goal.notBefore && todayISO() < goal.notBefore}>{open ? 'Cancel result' : 'Log test result'}</Button>}
    {open && <form onSubmit={save} className="personal-form"><label>Test date<input required className="input" type="date" value={draft.d} max={todayISO()} min={goal.notBefore} onChange={e => setDraft({ ...draft, d: e.target.value })} /></label><label>{goal.kind === 'beep' ? 'Completed level' : `Result (${goal.unit})`}<input required className="input" type="number" min={goal.kind === 'beep' ? '1' : '0'} step={goal.kind === 'beep' ? '1' : '0.1'} value={draft.value} onChange={e => setDraft({ ...draft, value: e.target.value })} /></label>
      {goal.kind === 'beep' && <label>Completed shuttle<input required className="input" type="number" min="1" max="30" value={draft.shuttle} onChange={e => setDraft({ ...draft, shuttle: e.target.value })} /></label>}
      {goal.kind === 'hang' && <><label>Grip<select className="input" value={draft.grip} onChange={e => setDraft({ ...draft, grip: e.target.value })}><option value="underhand">Underhand / reverse</option><option value="overhand">Overhand / straight</option></select></label><label className="personal-check"><input required type="checkbox" checked={draft.standard} onChange={e => setDraft({ ...draft, standard: e.target.checked })} />Unassisted, straight bar, chin above the bar without resting on it</label></>}
      <label>Protocol / conditions / comments<textarea className="input" maxLength={500} rows={2} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label><button className="btn primary" type="submit">Save result</button>
    </form>}
    {!!rows.length && <details><summary>Test history ({rows.length})</summary>{rows.slice().reverse().map(r => <div key={r.id} className="personal-history-row"><b>{r.d} · {resultLabel(goal, r)}</b><p className="small">{r.grip ? `${r.grip}. ` : ''}{r.note}</p><Button size="sm" onClick={() => { if (window.confirm('Remove this mistyped test result? This does not remove any workout.')) update(s => { s.goalResults = s.goalResults.filter(x => x.id !== r.id) }) }}>Remove result</Button></div>)}</details>}
  </section>
}

export default function Personal() {
  const nav = useNavigate(); const { S, update, config, user } = useStore()
  const [custom, setCustom] = useState({ name: '', target: '', unit: 'kg' })
  const goals = S.goals || []
  const add = template => update(s => { s.goals ||= []; s.goals.push({ ...template, id: crypto.randomUUID() }) })
  return <div className="narrow personal-page"><div className="hdr"><div><h1>Your training</h1><p className="sub">Goals, weekly progress and decisions</p></div><button className="iconbtn" aria-label="Back home" onClick={() => nav('/home')}><Icon name="chevronLeft" /></button></div>
    <WeeklyDashboard state={S} today={todayISO()} onInsights={() => nav('/insights')} />
    <section className="card"><h2>Share with your physio</h2><p className="small dim">A date-range PDF of your logged workouts, with optional notes, joint feedback and a separately labelled current plan.</p><Button onClick={() => nav('/personal/export')}>Export workouts to PDF</Button></section>
    <section className="card"><h2>Hang interval timer</h2><p className="small dim">Large countdown, adjustable hang/rest intervals and saved presets. No automatic workout logging.</p><Button onClick={() => nav('/personal/timer')}>Open hang timer</Button></section>
    {goals.filter(g => !g.archived).map(g => <GoalCard key={g.id} goal={g} />)}
    <section className="card"><h2>Add a goal</h2><p className="small dim">Templates add targets only; they never create a baseline or change your program.</p><div className="personal-actions">{GOAL_TEMPLATES.filter(t => !goals.some(g => !g.archived && g.kind === t.kind)).map(t => <Button key={t.kind} onClick={() => add(t)}>{t.name}</Button>)}</div>
      <details><summary>Custom strength or grip goal</summary><form className="personal-form" onSubmit={e => { e.preventDefault(); if (custom.name.trim() && Number(custom.target) > 0) { add({ kind: 'custom', name: custom.name.trim().slice(0, 80), target: Number(custom.target), unit: custom.unit, protocol: 'Record the same exercise, equipment and test method each time. These are manually logged results.' }); setCustom({ name: '', target: '', unit: 'kg' }) } }}><label>Goal name<input className="input" maxLength={80} required value={custom.name} onChange={e => setCustom({ ...custom, name: e.target.value })} /></label><label>Target<input className="input" required type="number" min="0.1" max="100000" step="0.1" value={custom.target} onChange={e => setCustom({ ...custom, target: e.target.value })} /></label><label>Unit<select className="input" value={custom.unit} onChange={e => setCustom({ ...custom, unit: e.target.value })}>{['kg', 'lb', 'reps', 'seconds'].map(u => <option key={u}>{u}</option>)}</select></label><button className="btn" type="submit">Add custom goal</button></form></details>
      {goals.some(g => g.archived) && <details><summary>Archived goals</summary>{goals.filter(g => g.archived).map(g => <Button key={g.id} onClick={() => update(s => { s.goals.find(x => x.id === g.id).archived = false })}>Restore {g.name}</Button>)}</details>}
    </section>
    <section className="card"><h2>Weekly ntfy reminder</h2><p className="small dim">Sunday at 7 pm Canberra time (Australia/Sydney, including daylight saving). The lock-screen message only says your weekly summary is ready; training details stay in the app. No AI API call.</p>
      <label className="personal-check"><input type="checkbox" disabled={!user} checked={!!user && !!S.personal?.weeklySummary} onChange={e => update(s => { s.personal = { ...s.personal, weeklySummary: e.target.checked } })} />Enable weekly summary reminder</label><p className="small dim">{!user ? 'Sign in with your passkey to enable server reminders. Guest changes stay only in this browser and cannot schedule notifications.' : config?.personalNotifications ? 'Server notification service configured.' : 'Server ntfy configuration is required before reminders can be delivered.'}</p>
    </section>
  </div>
}
