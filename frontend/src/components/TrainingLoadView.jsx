import { weeklyTrainingLoad, loadObservations } from '../lib/training-load.js'

export default function TrainingLoadView({ workouts }) {
  const rows = weeklyTrainingLoad(workouts), notes = loadObservations(rows), max = Math.max(1, ...rows.map(r => r.workingSets))
  return <section className="card" aria-label="Weekly training load">
    <h2>Training volume and consistency</h2><p className="small dim">Completed logs only. Working sets, recorded cardio minutes, timed holds and climbing sessions are kept separate; this is not an injury-risk or recovery score.</p>
    {!rows.length && <p>No completed training logged yet.</p>}
    {rows.map(row => <div key={row.week} style={{ margin: '12px 0' }}><div className="row between"><b>{row.week}</b><span>{row.sessions} sessions</span></div><div className="bar" style={{ height: 5, background: 'var(--surface-3)', borderRadius: 9 }}><i style={{ display: 'block', height: '100%', width: `${row.workingSets / max * 100}%`, background: 'var(--acc)' }} /></div><div className="small dim">{row.workingSets} working sets · {row.cardioMinutes} cardio min · {row.hangs} timed holds · {row.climbing} climbing</div></div>)}
    {!!notes.length && <details><summary>Notable logged changes</summary>{notes.map(note => <p className="small" key={note}>• {note}</p>)}<p className="small dim">A change is context to review—not evidence of harm, readiness or causation.</p></details>}
  </section>
}
