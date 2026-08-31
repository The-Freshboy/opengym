import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Button } from './ui.jsx'
import { modeOf, setLabel } from '../lib/history.js'
import { hangContextLabel } from '../lib/training-log.js'
import { lastLoggedExercise, reuseReason, repeatableSets, applyRepeatedSets } from '../lib/workout-reuse.js'

export function LastTime({ entryIdx }) {
  const { S, update } = useStore()
  const entry = S.active.entries[entryIdx]
  const last = lastLoggedExercise(S, entry)
  const timer = useUI(s => s.work)
  if (!last) return <p className="small dim">Last time: no logged sets yet.</p>
  const { workout, previous } = last
  const reason = reuseReason(S.active, entry, workout, previous)
  const started = entry.sets.some(s => s.done)
  return <section className="card" aria-label="Last time" style={{ marginBottom: 10 }}>
    <b>Last time · {workout.d}</b>{workout.incomplete && <span className="small"> · incomplete session</span>}{workout.copiedHistory && <span className="small"> · copied history, not a new performance</span>}
    <p className="small dim">{workout.trainingContext?.equipmentProfile?.name || 'No equipment profile recorded'} · {workout.unit || 'Weight unit not recorded'}</p>
    <div className="small">{previous.sets.filter(s => s.done).map((set, i) => <div key={i}>{setLabel(previous.id, set, { ...previous.target, id: previous.id })}{(modeOf({ ...previous.target, id: previous.id }) === 'reps' || (modeOf({ ...previous.target, id: previous.id }) === 'time' && set.w > 0)) && ` ${workout.unit || '(unit unknown)'}`}</div>)}</div>
    {hangContextLabel(previous.hangContext) && <p className="small">{hangContextLabel(previous.hangContext)}</p>}
    {previous.note && <p className="exnote">Exercise: {previous.note}</p>}
    {workout.note && <p className="exnote">Session: {workout.note}</p>}
    {!S.active.editingWorkoutId && <>
      <Button size="sm" icon="reset" disabled={!!reason || started || !!timer} onClick={() => update(s => {
        const current = s.active?.entries[entryIdx]
        if (!current || useUI.getState().work || s.active.editingWorkoutId) return
        const fresh = lastLoggedExercise(s, current)
        if (!fresh || reuseReason(s.active, current, fresh.workout, fresh.previous) || current.sets.some(x => x.done)) return
        applyRepeatedSets(current, repeatableSets(fresh.previous))
      })}>Use last working sets</Button>
      <p className="small dim">{started ? 'Sets already logged — copying is disabled.' : reason || 'Prefills numbers only; warm-ups stay, and working sets remain unchecked. Effort must be logged again.'}</p>
    </>}
  </section>
}

export function HoldLoggingContext({ entryIdx }) {
  const { S, update } = useStore()
  const entry = S.active.entries[entryIdx]
  const context = entry.hangContext || {}
  const locked = entry.sets.some(s => s.done) && !S.active.editingWorkoutId
  const suggestions = { hold: ['Straight bar', 'Large jug', 'Edge — specify depth'], grip: ['Overhand', 'Underhand', 'Open hand'], support: ['Unassisted', 'Feet supported', 'Band — specify colour / brand'], elbow: ['Flexed', 'Straight, not locked'] }
  return <details style={{ margin: '12px 0' }} open={!Object.values(context).some(Boolean)}>
    <summary>Hold / hang setup</summary>
    <p className="small dim">Record grip and assistance before starting. Describe bands rather than estimating assistance in kilograms. This is practice logging, not a certified test.</p>
    {Object.entries({ hold: 'Hold / edge depth (mm)', grip: 'Grip', support: 'Assistance', elbow: 'Elbow position' }).map(([key, label]) => <label key={key} style={{ display: 'block', marginBottom: 8 }}>{label}
      <input className="field" maxLength={120} disabled={locked} list={`hold-${entryIdx}-${key}`} value={context[key] || ''} onChange={event => update(s => { const row = s.active?.entries[entryIdx]; if (row) row.hangContext = { ...row.hangContext, [key]: event.target.value } })} />
      <datalist id={`hold-${entryIdx}-${key}`}>{suggestions[key].map(value => <option key={value} value={value} />)}</datalist>
    </label>)}
    {locked && <p className="small dim">Setup is locked after a set is logged so different assistance is not mixed. Add a separate exercise entry if your setup changes.</p>}
    <p className="small dim">Enter the seconds actually held before ticking a set. The timer also asks you to confirm the actual hold; elapsed time alone is not a result.</p>
  </details>
}
