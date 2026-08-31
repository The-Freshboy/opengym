import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { linkedHang, exerciseRest, validRest, setupKey, saveSetup } from '../lib/session-tools.js'

export default function SessionTools({ index }) {
  const { S, update } = useStore(), nav = useNavigate()
  const busy = useUI(s => !!s.work || !!s.timer)
  const entry = S.active.entries[index]
  const setupLocked = entry.sets.some(s => s.done)
  const remembered = S.trainingPreferences?.exerciseSetups?.find(m => m.key === setupKey(S.active, entry.id))
  const [note, setNote] = useState(entry.setupContext?.note ?? remembered?.note ?? '')
  const [message, setMessage] = useState('')
  const link = linkedHang(S, index)
  return <details className="card"><summary>Timer, rest and equipment setup</summary>
    {link && <><button className="btn" disabled={busy} onClick={() => nav('/personal/timer', { state: { hangLink: link } })}>Use this exercise in interval timer</button><p className="small dim">{link.config.sets} remaining working sets × {link.config.hang}s, {link.config.rest}s rest. Results need your confirmation.</p></>}
    <label>Rest between sets (seconds, this session)<input className="input" type="number" min="0" max="3600" step="1" value={exerciseRest(S, entry)} onChange={e => { if (validRest(e.target.value)) update(s => { s.active.entries[index].restSec = Number(e.target.value) }) }} /></label>
    <p className="small dim">Zero disables automatic rest. For supersets, rest follows the last exercise. Save a recurring rest target in the programme’s exercise editor.</p>
    <label>Equipment setup · {S.active.trainingContext?.equipmentProfile?.name || 'Unspecified location'}<textarea className="input" rows={3} maxLength={500} disabled={setupLocked} value={note} onChange={e => setNote(e.target.value)} placeholder="Seat height, cable position, handle, band or edge…" /></label>
    <button className="btn" disabled={setupLocked} onClick={() => { update(s => saveSetup(s, index, note)); setMessage('Setup saved for this exercise and location, and recorded with this session.') }}>Save setup for this location</button>
    {setupLocked && <p className="small dim">Setup is locked after logging a set. Add a separate exercise entry if you change equipment.</p>}
    <p className="small dim">Select your equipment profile before starting a workout to separate locations. Remembered text is a reference only: weights and assistance are never transferred.</p>
    {message && <p role="status">{message}</p>}
  </details>
}
