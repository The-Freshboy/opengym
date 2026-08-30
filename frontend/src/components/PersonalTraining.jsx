import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Button } from './ui.jsx'
import { exerciseHistory, acceptPersonalProposal } from '../lib/personal.js'
import { setLabel } from '../lib/history.js'

export function SessionFeedback({ workoutId }) {
  const { S, update } = useStore()
  const w = S.workouts.find(w => w.id === workoutId)
  if (!w) return null
  const f = w.feedback || {}
  const save = (key, value) => update(s => {
    const row = s.workouts.find(x => x.id === workoutId)
    if (!row) return
    row.feedback ||= {}
    if (value === '') delete row.feedback[key]
    else row.feedback[key] = value
    // Retain the existing coach-compatible effort field without sharing new health fields.
    if (key === 'difficulty') { if (value) row.rating = value; else delete row.rating }
  })
  return <section className="personal-feedback" aria-label="Session feedback">
    <h3>How did the session feel?</h3><p className="small dim">Optional. Saved to this workout, without needing an AI coach.</p>
    <label>Difficulty<select className="input" value={f.difficulty || w.rating || ''} onChange={e => save('difficulty', e.target.value)}><option value="">Not recorded</option><option value="easy">Easy</option><option value="right">About right</option><option value="hard">Very hard</option></select></label>
    <label>Energy<select className="input" value={f.energy || ''} onChange={e => save('energy', e.target.value ? Number(e.target.value) : '')}><option value="">Not recorded</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} / 5{n === 1 ? ' — low' : n === 5 ? ' — high' : ''}</option>)}</select></label>
    <label>Joint discomfort<select className="input" value={f.jointDiscomfort == null ? '' : String(f.jointDiscomfort)} onChange={e => save('jointDiscomfort', e.target.value === '' ? '' : e.target.value === 'true')}><option value="">Not recorded</option><option value="false">No</option><option value="true">Yes</option></select></label>
    <label>Anything to remember?<textarea className="input" rows={2} maxLength={1000} value={w.note || ''} onChange={e => update(s => { const row = s.workouts.find(x => x.id === workoutId); if (row) row.note = e.target.value })} /></label>
    {f.jointDiscomfort && <p className="small" role="status">Avoid aggravating work. Discuss persistent symptoms or joint instability with your Exercise Physiologist. This rating is not a diagnosis.</p>}
  </section>
}

export function RecentExerciseHistory({ id, excludeId }) {
  const S = useStore(s => s.S)
  const rows = exerciseHistory(S, id, excludeId).slice(0, 3)
  if (!rows.length) return <p className="small dim">No previous sessions for this exercise.</p>
  return <details className="personal-history"><summary>Previous sessions, effort & comments ({rows.length})</summary>
    {rows.map((e, i) => <article key={`${e.workoutId}-${i}`}><b>{e.d}</b>{e.incomplete && <span> · incomplete</span>}{e.variant === 'short' && <span> · short session</span>}
      <div>{e.sets.filter(s => s.done).map((s, j) => <div className="small" key={j}>{setLabel(e.id, s, e.target)}{Number.isFinite(s.rir) ? ` · RIR ${s.rir}` : Number.isFinite(s.rpe) ? ` · RPE ${s.rpe}` : ''}</div>)}</div>
      {e.note && <p className="exnote">Exercise: {e.note}</p>}{e.sessionNote && <p className="exnote">Session: {e.sessionNote}</p>}
      <p className="small dim">{e.rating ? `Difficulty: ${e.rating}. ` : ''}{e.feedback?.energy ? `Energy: ${e.feedback.energy}/5. ` : ''}{e.feedback?.jointDiscomfort ? 'Joint discomfort reported.' : ''}</p>
    </article>)}
  </details>
}

export function ProgressionApproval({ entryIdx }) {
  const { S, update } = useStore()
  const entry = S.active?.entries[entryIdx]
  const p = entry?.proposal
  if (!p) return null
  const dirty = entry.sets.some(s => s.done) || p.basis !== JSON.stringify(entry.sets)
  return <section className="personal-proposal" aria-label="Progression suggestion">
    <b>{p.kind === 'deload' ? 'Consider a reduction' : 'Progression to review'}</b>
    <p className="small">{p.reason}</p><p className="small dim">Evidence: {p.evidenceDates.join(', ')}. Accepted targets carry forward until you edit the saved prescription. The routine itself will not change.</p>
    <div className="personal-metrics">{Number.isFinite(p.weight) && <span>{entry.sets[0]?.w ?? '—'} → {p.weight} {S.unit}</span>}{Number.isFinite(p.reps) && <span>{entry.sets[0]?.r ?? '—'} → {p.reps} reps</span>}{Number.isFinite(p.sec) && <span>{entry.sets[0]?.sec ?? '—'} → {p.sec} seconds</span>}</div>
    {p.status === 'pending' ? <><div className="row"><Button disabled={dirty} variant="primary" onClick={() => { try { update(s => acceptPersonalProposal(s.active.entries[entryIdx])) } catch (e) { useUI.getState().toast(e.message) } }}>Accept targets</Button><Button onClick={() => update(s => { s.active.entries[entryIdx].proposal.status = 'declined' })}>Keep targets</Button></div>{dirty && <p className="small">Sets changed or training started. Keep your current targets.</p>}</> : <p className="small">Decision: {p.status}. Logged with the session.</p>}
  </section>
}
