import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Button } from './ui.jsx'
import { exerciseHistory, acceptPersonalProposal } from '../lib/personal.js'
import { setLabel } from '../lib/history.js'
import { hangContextLabel, nerveSymptomsReported } from '../lib/training-log.js'

export function HangContext({ entryIdx }) {
  const { S, update } = useStore()
  const c = S.active?.entries[entryIdx]?.hangContext || {}
  return <details style={{ margin: '12px 0' }}><summary>Hold / assistance context (optional)</summary>
    <p className="small dim">For comparable practice logs, not test certification. Describe feet support or band identity; do not guess assistance in kilograms.</p>
    {[['hold', 'Hold / edge size'], ['grip', 'Grip'], ['support', 'Feet support / band / unassisted'], ['elbow', 'Elbow position']].map(([key, label]) => <label key={key} style={{ display: 'block', marginBottom: 8 }}>{label}<input className="field" maxLength={120} value={c[key] || ''} onChange={e => update(s => { const row = s.active?.entries[entryIdx]; if (row) row.hangContext = { ...row.hangContext, [key]: e.target.value } })} /></label>)}
  </details>
}

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
    <label>Session effort (1–10, optional)<input className="input" type="number" min="1" max="10" value={w.sessionRpe ?? ''} onChange={e => { const n = Number(e.target.value); if (e.target.value !== '' && (!Number.isFinite(n) || n < 1 || n > 10)) return; update(s => { const row = s.workouts.find(x => x.id === workoutId); if (row) { if (e.target.value === '') delete row.sessionRpe; else row.sessionRpe = n } }) }} /></label>
    <details><summary>Nerve symptoms (optional, private health information)</summary><p className="small dim">Describe symptoms for your EP, not a diagnosis. Not recorded is different from No.</p>
      {['tingling', 'numbness', 'weakness'].map(key => <label key={key}>{key}<select className="input" value={f[key] == null ? '' : String(f[key])} onChange={e => save(key, e.target.value === '' ? '' : e.target.value === 'true')}><option value="">Not recorded</option><option value="false">No</option><option value="true">Yes</option></select></label>)}
      <label>Side / location<input className="input" maxLength={120} value={f.symptomLocation || ''} onChange={e => save('symptomLocation', e.target.value)} /></label>
      <label>When<select className="input" value={f.symptomTiming || ''} onChange={e => save('symptomTiming', e.target.value)}><option value="">Not recorded</option>{['Before training', 'During training', 'After training', 'Next day', 'Multiple times — see notes'].map(x => <option key={x}>{x}</option>)}</select></label>
      <p className="small dim">These fields are stored with this workout. Include them in a PDF only when you choose feedback sharing.</p>
    </details>
    {nerveSymptomsReported(f) && <p className="small" role="status">Do not push through increasing nerve symptoms. Follow your EP's individual instructions; seek prompt clinical review for new or worsening weakness or persistent numbness. No progression is suggested from this feedback.</p>}
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
      {hangContextLabel(e.hangContext) && <p className="small">{hangContextLabel(e.hangContext)}</p>}
      {e.setupContext && <p className="small">Equipment setup · {e.setupContext.location}: {e.setupContext.note || 'Not specified'}</p>}
      {nerveSymptomsReported(e.feedback) && <p className="small">Nerve symptoms were reported; review session feedback.</p>}
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
