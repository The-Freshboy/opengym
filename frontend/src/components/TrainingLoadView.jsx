import { weeklyTrainingLoad, loadObservations } from '../lib/training-load.js'

function weekLabel(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(key)
  if (!match) return key
  const year = Number(match[1]), week = Number(match[2])
  const fourth = new Date(Date.UTC(year, 0, 4))
  const monday = new Date(fourth)
  monday.setUTCDate(fourth.getUTCDate() - ((fourth.getUTCDay() + 6) % 7) + (week - 1) * 7)
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6)
  const short = date => date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${short(monday)} – ${short(sunday)}`
}

export default function TrainingLoadView({ workouts }) {
  const rows = weeklyTrainingLoad(workouts), notes = loadObservations(rows), max = Math.max(1, ...rows.map(r => r.workingSets))
  return <section className="card" aria-label="Weekly training load">
    <h2>Training volume and consistency</h2><p className="small dim">Completed logs only. Working sets, recorded cardio minutes, timed holds and climbing sessions are kept separate; this is not an injury-risk or recovery score.</p>
    {!rows.length && <p>No completed training logged yet.</p>}
    {rows.map(row => <div className="training-load-week" key={row.week}><div className="row between"><b>{weekLabel(row.week)}</b><span className="small">{row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}</span></div><div className="bar"><i style={{ width: `${row.workingSets / max * 100}%` }} /></div><div className="training-load-metrics"><span><b>{row.workingSets}</b> working sets</span><span><b>{row.cardioMinutes}</b> cardio min</span><span><b>{row.hangs}</b> timed holds</span>{row.climbing > 0 && <span><b>{row.climbing}</b> climbing</span>}</div></div>)}
    {!!notes.length && <details><summary>Notable logged changes</summary>{notes.map(note => <p className="small" key={note}>• {note}</p>)}<p className="small dim">A change is context to review—not evidence of harm, readiness or causation.</p></details>}
  </section>
}
