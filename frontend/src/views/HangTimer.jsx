import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { beep, vibrate } from '../lib/sound.js'
import { TIMER_DEFAULTS, TIMER_FIELDS, timerError, timerPhases, phaseRemaining } from '../lib/hang-timer.js'
import './hang-timer.css'

export default function HangTimer() {
  const nav = useNavigate(), { S, update } = useStore()
  const otherTimer = useUI(s => !!s.timer || !!s.work)
  const [config, setConfig] = useState({ ...TIMER_DEFAULTS })
  const [phases, setPhases] = useState([]), [index, setIndex] = useState(0)
  const [status, setStatus] = useState('idle'), [remaining, setRemaining] = useState(0)
  const [message, setMessage] = useState(''), [name, setName] = useState('')
  const deadline = useRef(0), timeLeft = useRef(0), lastTick = useRef(0), lastCue = useRef(-1)
  const phase = phases[index], locked = status === 'running' || status === 'paused'
  const presets = (S.personal?.hangTimerPresets || []).slice(0, 20)
  const error = timerError(config)
  const signal = () => { beep(S.sound !== false, 880, 0.18); if (S.haptics !== false) vibrate(100) }
  const pause = (reason = '') => {
    timeLeft.current = phaseRemaining(deadline.current, performance.now())
    setRemaining(timeLeft.current); setStatus('paused'); setMessage(reason)
  }
  const begin = () => {
    if (error || otherTimer) return
    const plan = timerPhases(config)
    setPhases(plan); setIndex(0); setMessage(''); setStatus('running')
    timeLeft.current = plan[0].seconds * 1000
    deadline.current = performance.now() + timeLeft.current; lastTick.current = performance.now(); lastCue.current = -1
    setRemaining(timeLeft.current); signal()
  }
  useEffect(() => {
    if (status !== 'running') return
    const tick = () => {
      const now = performance.now()
      // Never silently advance through hangs if the browser was suspended.
      if (now - lastTick.current > 1500) {
        timeLeft.current = phaseRemaining(deadline.current, lastTick.current)
        setRemaining(timeLeft.current); setStatus('paused'); setMessage('Timer interrupted. Check your position before resuming.'); return
      }
      lastTick.current = now
      const left = phaseRemaining(deadline.current, now)
      timeLeft.current = left; setRemaining(left)
      const seconds = Math.ceil(left / 1000)
      if (seconds > 0 && seconds <= 3 && lastCue.current !== seconds) { lastCue.current = seconds; signal() }
      if (!left) {
        signal(); lastCue.current = -1
        if (index + 1 >= phases.length) { setStatus('finished'); return }
        const next = index + 1
        timeLeft.current = phases[next].seconds * 1000; deadline.current = now + timeLeft.current
        setIndex(next); setRemaining(timeLeft.current)
      }
    }
    const hidden = () => { if (document.hidden) pause('Paused because the app was hidden or the screen locked.') }
    const id = setInterval(tick, 100)
    document.addEventListener('visibilitychange', hidden)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', hidden) }
  }, [status, index, phases, S.sound, S.haptics])
  const reset = () => { setStatus('idle'); setIndex(0); setRemaining(0); setMessage('') }
  const total = timerPhases(config).reduce((n, p) => n + p.seconds, 0)
  return <div className="narrow hang-timer-page">
    <div className="hdr"><h1>Hang interval timer</h1><button className="btn" onClick={() => { if (!locked || window.confirm('Leave and stop this timer? No workout sets will be logged.')) nav('/personal') }}>Back</button></div>
    <p className="small dim">Tabata-style controls, not a Tabata training prescription. Follow your agreed hang dose; timer completion does not log a set or test result.</p>
    <section className={`card hang-clock ${phase?.kind === 'Hang' && locked ? 'hang-clock-work' : ''}`}>
      <h2 aria-live="polite">{status === 'idle' ? 'Ready when you are' : status === 'finished' ? 'Intervals finished' : `${phase?.kind}${status === 'paused' ? ' · paused' : ''}`}</h2>
      <div className="hang-digits" role="timer" aria-label="Seconds remaining">{status === 'idle' ? '—' : Math.ceil(remaining / 1000)}</div>
      <p>{locked && phase?.cycle ? `Cycle ${phase.cycle}/${config.cycles} · Set ${phase.set || config.sets}/${config.sets}` : `${config.sets} sets × ${config.cycles} cycles`}</p>
      <p className="dim">{locked ? `Next: ${phases[index + 1]?.kind || 'Finish'}` : `${Math.floor(total / 60)} min ${total % 60} sec total`}</p>
      <div className="hang-controls">
        {(status === 'idle' || status === 'finished') && <button className="btn primary" disabled={!!error || otherTimer} onClick={begin}>Start timer</button>}
        {status === 'running' && <button className="btn primary" onClick={() => pause()}>Pause</button>}
        {status === 'paused' && <button className="btn primary" onClick={() => { deadline.current = performance.now() + timeLeft.current; lastTick.current = performance.now(); setStatus('running'); setMessage(''); signal() }}>Resume</button>}
        <button className="btn" onClick={() => { if (!locked || window.confirm('Stop and reset this timer?')) reset() }}>Reset</button>
      </div>
      {message && <p role="status">{message}</p>}
      {otherTimer && <p>Finish or cancel the existing workout timer before starting this one.</p>}
      {status === 'finished' && <p>Nothing has been added to your workout log. Record only the hangs you actually completed.</p>}
    </section>
    <p className="small dim">Keep this screen open. Switching apps or locking the phone pauses the timer; background sounds are not guaranteed. Leaving this page stops it. Sound and vibration follow your app settings.</p>
    <details open={!locked} className="card"><summary>Intervals and presets</summary>
      <fieldset disabled={locked} className="hang-settings">
        {Object.entries(TIMER_FIELDS).map(([key, label]) => <label key={key}>{label}{!['sets', 'cycles'].includes(key) && ' (seconds)'}<input className="input" type="number" inputMode="numeric" min={['hang', 'sets', 'cycles'].includes(key) ? 1 : 0} max={['sets', 'cycles'].includes(key) ? 50 : 3600} step="1" value={config[key]} onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))} /></label>)}
        {error && <p role="alert">{error}</p>}
        <p className="small dim">Rest occurs between sets, recovery between cycles. Zero skips an optional interval. Example values are editable, not a new prescription.</p>
        <label>Preset name<input className="input" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>
        <button className="btn" disabled={!!error || !name.trim() || presets.length >= 20} onClick={() => { update(s => { s.personal ||= {}; s.personal.hangTimerPresets = [...presets, { id: crypto.randomUUID(), name: name.trim(), config: { ...config } }] }); setName(''); setMessage('Preset saved') }}>Save preset</button>
        {presets.map(p => <div className="hang-controls" key={p.id}><button className="btn" onClick={() => { setConfig({ ...TIMER_DEFAULTS, ...p.config }); reset() }}>Load {p.name}</button><button className="btn" aria-label={`Delete preset ${p.name}`} onClick={() => { if (window.confirm(`Delete preset “${p.name}”?`)) update(s => { s.personal.hangTimerPresets = presets.filter(x => x.id !== p.id) }) }}>Delete</button></div>)}
      </fieldset>
    </details>
  </div>
}
