import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { todayISO, fmtDate } from '../lib/format.js'
import { checkInWorkouts, saveNextDayCheckIn, symptomFields } from '../lib/next-day.js'
import { Button } from './ui.jsx'

const labels = { jointDiscomfort: 'Joint discomfort or pain', tingling: 'Tingling', numbness: 'Numbness', weakness: 'Weakness' }
function CheckInForm({ workout, today }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(workout.nextDayCheckIn || {})
  const [error, setError] = useState('')
  const update = useStore(s => s.update)
  const saved = workout.nextDayCheckIn?.status === 'recorded'
  const field = (key, value) => setDraft(d => ({ ...d, [key]: value }))
  return <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
    <div className="small"><b>{workout.name || 'Workout'}</b> · {fmtDate(workout.d)}</div>
    {!open ? <Button variant="ghost" onClick={() => { setDraft(workout.nextDayCheckIn || {}); setOpen(true) }}>{saved ? 'Review / edit check-in' : 'Add next-day check-in'}</Button> : <form onSubmit={e => {
      e.preventDefault()
      try { update(s => saveNextDayCheckIn(s, workout.id, draft, today)); setError(''); setOpen(false) } catch (err) { setError(err.message) }
    }}>
      {symptomFields.map(key => <label key={key} style={{ display: 'block', marginTop: 12 }}>{labels[key]}
        <select aria-label={labels[key]} value={typeof draft[key] === 'boolean' ? String(draft[key]) : ''} onChange={e => field(key, e.target.value === '' ? undefined : e.target.value === 'true')} style={{ width: '100%', minHeight: 44, padding: 8, borderRadius: 8, marginTop: 5 }}>
          <option value="">Choose…</option><option value="false">No</option><option value="true">Yes</option>
        </select>
      </label>)}
      <label style={{ display: 'block', marginTop: 12 }}>Compared with your usual baseline
        <select aria-label="Compared with your usual baseline" value={draft.change || ''} onChange={e => field('change', e.target.value)} style={{ width: '100%', minHeight: 44, padding: 8, borderRadius: 8, marginTop: 5 }}>
          <option value="">Choose…</option><option value="better">Better</option><option value="same">About the same</option><option value="worse">Worse</option><option value="unsure">Unsure</option>
        </select>
      </label>
      <label style={{ display: 'block', marginTop: 12 }}>Notes (optional)<textarea aria-label="Next-day notes" maxLength={1000} rows={3} value={draft.note || ''} onChange={e => field('note', e.target.value)} style={{ width: '100%', marginTop: 5 }} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}><Button type="submit" variant="primary">Save check-in</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Later</Button></div>
    </form>}
    {saved && !open && <div className="small dim">Saved · {symptomFields.filter(k => workout.nextDayCheckIn[k]).map(k => labels[k]).join(', ') || 'No listed symptoms reported'} · {workout.nextDayCheckIn.change}</div>}
  </div>
}

export default function NextDayCheckIn() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const workouts = checkInWorkouts(S.workouts, today)
  const recent = (S.workouts || []).filter(w => w.nextDayCheckIn?.status === 'recorded' && w.nextDayCheckIn.date < today)
    .slice().sort((a, b) => b.nextDayCheckIn.date.localeCompare(a.nextDayCheckIn.date)).slice(0, 10)
  if (!workouts.length && !recent.length) return null
  return <section className="card" aria-label="Next-day check-in"><h2>How are you feeling today?</h2>
    <p className="small dim">Optional check-in following yesterday’s training. This records what you noticed, not what caused it. Follow your EP’s guidance; stop an exercise if it hurts.</p>
    {workouts.map(w => <CheckInForm key={w.id + today} workout={w} today={today} />)}
    {!!recent.length && <details style={{ marginTop: 12 }}><summary>Recent saved check-ins</summary>{recent.map(w => <div key={w.id} style={{ marginTop: 12 }}>
      <b>{w.name || 'Workout'} · {fmtDate(w.d)}</b>
      <p className="small">Check-in {w.nextDayCheckIn.date}: {w.nextDayCheckIn.change} compared with baseline. {symptomFields.filter(k => w.nextDayCheckIn[k] === true).map(k => labels[k]).join(', ') || 'No listed symptoms reported'}.</p>
      {w.nextDayCheckIn.note && <p className="exnote">{w.nextDayCheckIn.note}</p>}
    </div>)}<p className="small dim">Latest 10 check-ins. Older records remain attached to their workouts and can be included in your physio export when feedback sharing is enabled.</p></details>}
  </section>
}
