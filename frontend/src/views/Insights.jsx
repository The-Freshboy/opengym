import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { expandedRecords, insightSummary, readinessAdvice } from '../lib/insights.js'
import { todayISO } from '../lib/format.js'
import { Button, NumberField, Section, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

export default function Insights() {
  const nav = useNavigate(); const { S, update } = useStore(); const x = insightSummary(S); const advice = readinessAdvice(S, todayISO()); const records = expandedRecords(S)
  const [block, setBlock] = useState({ name: '', goal: '', weeks: 4 })
  const blocks = S.trainingBlocks || []
  const addBlock = () => { if (!block.name.trim()) return; update(s => { s.trainingBlocks ||= []; s.trainingBlocks.push({ ...block, id: crypto.randomUUID(), start: todayISO(), active: true }) }); setBlock({ name: '', goal: '', weeks: 4 }) }
  return <div className="page">
    <div className="hdr"><div><h1>Insights</h1><div className="sub">Training trends and decisions</div></div><button className="iconbtn" onClick={() => nav('/history')} aria-label="History"><Icon name="history" /></button></div>
    <div className="tiles"><div className="tile"><div className="l">Adherence · 28d</div><div className="v">{x.adherence == null ? '—' : `${x.adherence}%`}</div></div><div className="tile"><div className="l">Workload change</div><div className="v">{x.workloadChange == null ? '—' : `${x.workloadChange > 0 ? '+' : ''}${x.workloadChange}%`}</div></div><div className="tile"><div className="l">Readiness</div><div className="v">{x.readinessAvg == null ? '—' : `${x.readinessAvg.toFixed(1)}/5`}</div></div><div className="tile"><div className="l">Climbing sessions</div><div className="v">{x.climbing.length}</div></div></div>
    {advice && <div className="card"><h2>Today’s adjustment</h2><p>{advice.text}</p><Button onClick={() => nav('/plan')}>Review today’s plan</Button></div>}
    {x.workloadChange > 30 && <div className="card" style={{ borderColor: 'var(--orange)' }}><b>Workload jumped {x.workloadChange}%</b><p className="dim small">Consider holding volume steady while you recover. This is a training prompt, not medical advice.</p></div>}
    <Section title="Climbing"><div className="card"><div className="row between"><div><b>{x.climbing.length} sessions in 28 days</b><div className="small dim">{x.bestGrade ? `Latest logged grade: ${x.bestGrade}` : 'Log attempts, sends and grades for richer trends.'}</div></div></div></div></Section>
    {!!records.length && <Section title="Personal records">{records.map(r => <div className="card row between" key={r.type} style={{ marginBottom: 8 }}><div><b>{r.type}</b><div className="small dim">{r.date}</div></div><strong className="accent">{r.value}</strong></div>)}</Section>}
    <Section title="Training blocks">
      {blocks.map(b => <div className="card" key={b.id} style={{ marginBottom: 8 }}><b>{b.name}</b><div className="small dim">{b.weeks} weeks · started {b.start}{b.goal ? ` · ${b.goal}` : ''}</div></div>)}
      <div className="card"><TextField value={block.name} onChange={e => setBlock({ ...block, name: e.target.value })} placeholder="Block name" /><div style={{ height: 8 }} /><TextField value={block.goal} onChange={e => setBlock({ ...block, goal: e.target.value })} placeholder="Goal (optional)" /><div style={{ height: 10 }} /><div className="row between"><span>Weeks</span><NumberField value={block.weeks} decimal={false} onChange={weeks => setBlock({ ...block, weeks: Math.min(16, Math.max(1, weeks)) })} /></div><div style={{ height: 10 }} /><Button variant="primary" onClick={addBlock}>Start training block</Button></div>
    </Section>
    <Button onClick={() => nav('/stats')}>Detailed charts and records</Button>
  </div>
}
