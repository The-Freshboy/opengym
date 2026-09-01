import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { linkedHang, exerciseRest, validRest, setupKey, saveSetup } from '../lib/session-tools.js'
import { approvedAlternatives } from '../lib/workout-tools.js'
import { exOr } from '../lib/exercises.js'
import WarmupAssistant from './WarmupAssistant.jsx'
import PlateCalculator from './PlateCalculator.jsx'

export default function SessionTools({ index, onSubstitute }) {
  const { S, update } = useStore(), nav = useNavigate()
  const busy = useUI(s => !!s.work || !!s.timer)
  const entry = S.active.entries[index]
  const setupLocked = entry.sets.some(s => s.done)
  const remembered = S.trainingPreferences?.exerciseSetups?.find(m => m.key === setupKey(S.active, entry.id))
  const [note, setNote] = useState(entry.setupContext?.note ?? remembered?.note ?? '')
  const [message, setMessage] = useState('')
  const link = linkedHang(S, index)
  const profile = S.active.trainingContext?.equipmentProfile
  const alternatives = entry.target?.mandatory ? [] : approvedAlternatives(entry, profile)
  const barbell = /barbell|olympic bar|ez bar/i.test(exOr(entry.id).eq || '')
  const workingWeight = entry.sets.find(s => s.type !== 'warmup')?.w || 0
  return <details className="card"><summary>Timer, rest and equipment setup</summary>
    {!!alternatives.length && <section><h3>Approved alternatives</h3>{alternatives.map(({ ex, available }) => <div className="row between" key={ex.id} style={{ gap: 8, margin: '8px 0' }}><div><b className="capitalize">{ex.n}</b><div className="small dim">{ex.eq || 'Equipment not specified'} · {available === true ? 'listed at this location' : available === false ? 'not found in this location profile' : 'location equipment not classified'}</div></div><button className="btn" disabled={busy || setupLocked} onClick={() => onSubstitute(ex.id)}>Use today</button></div>)}<p className="small dim">Only alternatives approved in the routine appear here. Equipment matching is a text check and never changes or transfers loads.</p></section>}
    {!entry.target?.mandatory && !alternatives.length && <p className="small dim">No routine-approved alternatives recorded for this exercise.</p>}
    {link && <><button className="btn" disabled={busy} onClick={() => nav('/personal/timer', { state: { hangLink: link } })}>Use this exercise in interval timer</button><p className="small dim">{link.config.sets} remaining working sets × {link.config.hang}s, {link.config.rest}s rest. Results need your confirmation.</p></>}
    <label>Rest between sets (seconds, this session)<input className="input" type="number" min="0" max="3600" step="1" value={exerciseRest(S, entry)} onChange={e => { if (validRest(e.target.value)) update(s => { s.active.entries[index].restSec = Number(e.target.value) }) }} /></label>
    <p className="small dim">Zero disables automatic rest. For supersets, rest follows the last exercise. Save a recurring rest target in the programme’s exercise editor.</p>
    <label>Equipment setup · {S.active.trainingContext?.equipmentProfile?.name || 'Unspecified location'}<textarea className="input" rows={3} maxLength={500} disabled={setupLocked} value={note} onChange={e => setNote(e.target.value)} placeholder="Seat height, cable position, handle, band or edge…" /></label>
    <button className="btn" disabled={setupLocked} onClick={() => { update(s => saveSetup(s, index, note)); setMessage('Setup saved for this exercise and location, and recorded with this session.') }}>Save setup for this location</button>
    {setupLocked && <p className="small dim">Setup is locked after logging a set. Add a separate exercise entry if you change equipment.</p>}
    <p className="small dim">Select your equipment profile before starting a workout to separate locations. Remembered text is a reference only: weights and assistance are never transferred.</p>
    {message && <p role="status">{message}</p>}
    <WarmupAssistant key={`warmup-${entry.id}-${workingWeight}`} index={index} />
    {barbell && <PlateCalculator key={`plates-${entry.id}-${workingWeight}`} target={workingWeight} />}
  </details>
}
