import { useState } from 'react'
import { changeTimeline } from '../lib/change-timeline.js'
import { exOr } from '../lib/exercises.js'

export default function ChangeTimeline({ state }) {
  const [filter, setFilter] = useState('all')
  const rows = changeTimeline(state).filter(r => filter === 'all' || r.type === filter)
  return <details className="card"><summary>What changed?</summary><p className="small dim">Programme edits, setup notes and reported feedback in date order. Nearby events do not prove that one caused another. Shows up to the latest 100 events; programme snapshots retain the latest 10 edits.</p>
    <label>Show<select className="input" value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'programme', 'equipment', 'comments', 'check-ins'].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
    {!rows.length && <p>No matching events recorded yet.</p>}
    {rows.map((r, i) => <article key={`${r.at}-${i}`} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0', overflowWrap: 'anywhere' }}><div className="small dim">{new Date(r.at).toLocaleString()}</div><h3>{r.title}</h3>{r.exerciseId && <p>{exOr(r.exerciseId).n}</p>}<p>{r.detail}</p></article>)}
  </details>
}
