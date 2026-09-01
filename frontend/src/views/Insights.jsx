import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { expandedRecords, insightSummary, readinessAdvice } from '../lib/insights.js'
import { todayISO } from '../lib/format.js'
import { Button, Section, TextField } from '../components/ui.jsx'
import Stepper from '../components/Stepper.jsx'
import Icon from '../components/Icon.jsx'
import { editTrainingBlock } from '../lib/training-log.js'
import TrainingLoadView from '../components/TrainingLoadView.jsx'

function BlockCard({ block, save }) {
  const [draft, setDraft] = useState({ ...block }), [error, setError] = useState('')
  return <div className="card" style={{ marginBottom: 8 }}><b>{block.name}</b><div className="small dim">{block.weeks} weeks · started {block.start}{block.goal ? ` · ${block.goal}` : ''}{block.active === false ? ' · archived' : ''}</div>
    <details><summary>Edit block</summary><label>Name<input className="field" maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Goal<input className="field" maxLength={300} value={draft.goal || ''} onChange={e => setDraft({ ...draft, goal: e.target.value })} /></label><label>Weeks<input className="field" type="number" min="1" max="16" value={draft.weeks} onChange={e => setDraft({ ...draft, weeks: e.target.value })} /></label><Button onClick={() => { try { save(editTrainingBlock(block, draft)); setError('') } catch (e) { setError(e.message) } }}>Save block details</Button>{error && <p role="alert">{error}</p>}</details>
    <Button size="sm" onClick={() => save({ ...block, active: block.active === false, archivedAt: block.active === false ? null : todayISO() })}>{block.active === false ? 'Restore block' : 'Archive block'}</Button><p className="small dim">Block metadata does not change your scheduled workouts.</p>
  </div>
}

export default function Insights() {
  const nav = useNavigate(); const { S, update } = useStore(); const x = insightSummary(S); const advice = readinessAdvice(S, todayISO()); const records = expandedRecords(S)
  const [block, setBlock] = useState({ name: '', goal: '', weeks: 4 })
  const [showArchived, setShowArchived] = useState(false)
  const blocks = S.trainingBlocks || []
  const addBlock = () => { if (!block.name.trim()) return; update(s => { s.trainingBlocks ||= []; s.trainingBlocks.push({ ...block, id: crypto.randomUUID(), start: todayISO(), active: true }) }); setBlock({ name: '', goal: '', weeks: 4 }) }
  return <div className="page">
    <div className="hdr"><div><h1>Insights</h1><div className="sub">Training trends and decisions</div></div><button className="iconbtn" onClick={() => nav('/history')} aria-label="History"><Icon name="history" /></button></div>
    <div className="tiles"><div className="tile"><div className="l">Adherence · 28d</div><div className="v">{x.adherence == null ? '—' : `${x.adherence}%`}</div></div><div className="tile"><div className="l">Workload change</div><div className="v">{x.workloadChange == null ? '—' : `${x.workloadChange > 0 ? '+' : ''}${x.workloadChange}%`}</div></div><div className="tile"><div className="l">Readiness</div><div className="v">{x.readinessAvg == null ? '—' : `${x.readinessAvg.toFixed(1)}/5`}</div></div><div className="tile"><div className="l">Climbing sessions</div><div className="v">{x.climbing.length}</div></div></div>
    {advice && <div className="card"><h2>Today’s adjustment</h2><p>{advice.text}</p><Button onClick={() => nav('/plan')}>Review today’s plan</Button></div>}
    <p className="small dim">Session-effort load uses recorded duration × session effort: {x.ratedSessions} of {x.recent.length} recent sessions have both. No effort is assumed. Changes are shown only when both periods have complete coverage; this is not an injury-risk score.</p>
    <p className="small dim">Adherence uses retained programme snapshots where available. Older planning intent cannot be reconstructed; missing or copied logs are not proof of fitness.</p>
    <Section title="Climbing"><div className="card"><div className="row between"><div><b>{x.climbing.length} sessions in 28 days</b><div className="small dim">{x.bestGrade ? `Latest logged grade: ${x.bestGrade}` : 'Log attempts, sends and grades for richer trends.'}</div></div></div></div></Section>
    <TrainingLoadView workouts={S.workouts} />
    {!!records.length && <Section title="Personal records">{records.map(r => <div className="card row between" key={r.type} style={{ marginBottom: 8 }}><div><b>{r.type}</b><div className="small dim">{r.date}</div></div><strong className="accent">{r.value}</strong></div>)}</Section>}
    <Section title="Training blocks">
      <label className="small"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived blocks</label>
      {blocks.filter(b => showArchived || b.active !== false).map(b => <BlockCard key={`${b.id}-${b.active}`} block={b} save={next => update(s => { const index = s.trainingBlocks.findIndex(x => x.id === b.id); if (index >= 0) s.trainingBlocks[index] = next })} />)}
      <div className="card training-block-form"><TextField value={block.name} onChange={e => setBlock({ ...block, name: e.target.value })} placeholder="Block name" /><TextField value={block.goal} onChange={e => setBlock({ ...block, goal: e.target.value })} placeholder="Goal (optional)" /><Stepper label="Weeks" value={block.weeks} min={1} max={16} decimal={false} onChange={weeks => setBlock({ ...block, weeks: Math.min(16, Math.max(1, weeks)) })} /><Button variant="primary" onClick={addBlock}>Start training block</Button></div>
    </Section>
    <Button onClick={() => nav('/stats')}>Detailed charts and records</Button>
  </div>
}
