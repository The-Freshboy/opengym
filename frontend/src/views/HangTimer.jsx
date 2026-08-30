import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { beep, vibrate } from '../lib/sound.js'
import { TIMER_DEFAULTS, TIMER_FIELDS, timerError, timerPhases, phaseRemaining, timerClock, remainingSession } from '../lib/hang-timer.js'
import './hang-timer.css'

export default function HangTimer() {
  const nav = useNavigate(), { S, update } = useStore()
  const otherTimer = useUI(s => !!s.timer || !!s.work)
  const [config, setConfig] = useState({ ...TIMER_DEFAULTS })
  const [phases, setPhases] = useState([]), [index, setIndex] = useState(0)
  const [status, setStatus] = useState('idle'), [remaining, setRemaining] = useState(0)
  const [message, setMessage] = useState(''), [name, setName] = useState('')
  const [focused, setFocused] = useState(false)
  const focusPanel = useRef(null)
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
    setPhases(plan); setIndex(0); setMessage(''); setStatus('running'); setFocused(true)
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
  useEffect(() => {
    if (!focused) return
    const previousFocus = document.activeElement, overflow = document.body.style.overflow
    const background = ['app', 'tabbar', 'timer'].map(id => document.getElementById(id)).filter(Boolean)
    const previousInert = background.map(el => el.inert)
    background.forEach(el => { el.inert = true })
    document.body.style.overflow = 'hidden'
    focusPanel.current?.querySelector('button')?.focus()
    return () => {
      background.forEach((el, i) => { el.inert = previousInert[i] })
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [focused])
  const reset = () => { setStatus('idle'); setIndex(0); setRemaining(0); setMessage(''); setFocused(false) }
  const resume = () => { deadline.current = performance.now() + timeLeft.current; lastTick.current = performance.now(); setStatus('running'); setMessage(''); signal() }
  const leaveFocus = () => { if (status === 'running') pause('Paused while viewing settings.'); setFocused(false) }
  const jump = offset => {
    const next = index + offset
    if (next < 0 || next >= phases.length) return
    timeLeft.current = phases[next].seconds * 1000
    setRemaining(timeLeft.current); setIndex(next); lastCue.current = -1
    setStatus('paused'); setMessage('Interval changed. Press play when ready; nothing was logged.')
  }
  const total = timerPhases(config).reduce((n, p) => n + p.seconds, 0)
  const clock = timerClock(remaining)
  const phaseName = status === 'finished' ? 'Finished' : phase?.kind || 'Ready'
  const colours = { Hang: 'work', Rest: 'rest', Recover: 'recover', 'Get ready': 'ready', 'Warm up': 'warmup', 'Cool down': 'cooldown' }
  const focusKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); leaveFocus() }
    if (e.key === 'Tab') {
      const buttons = [...focusPanel.current.querySelectorAll('button:not(:disabled)')]
      if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons.at(-1).focus() }
      else if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0].focus() }
    }
  }
  return <div className="narrow hang-timer-page">
    <div className="hdr"><h1>Hang interval timer</h1><button className="btn" onClick={() => { if (!locked || window.confirm('Leave and stop this timer? No workout sets will be logged.')) nav('/personal') }}>Back</button></div>
    <p className="small dim">Tabata-style controls, not a Tabata training prescription. Follow your agreed hang dose; timer completion does not log a set or test result.</p>
    <section className={`card hang-clock ${phase?.kind === 'Hang' && locked ? 'hang-clock-work' : ''}`}>
      <h2 aria-live="polite">{status === 'idle' ? 'Ready when you are' : status === 'finished' ? 'Intervals finished' : `${phase?.kind}${status === 'paused' ? ' · paused' : ''}`}</h2>
      <div className="hang-digits" role="timer" aria-label="Interval time remaining">{status === 'idle' ? '—' : clock}</div>
      <p>{locked && phase?.cycle ? `Cycle ${phase.cycle}/${config.cycles} · Set ${phase.set || config.sets}/${config.sets}` : `${config.sets} sets × ${config.cycles} cycles`}</p>
      <p className="dim">{locked ? `Next: ${phases[index + 1]?.kind || 'Finish'}` : `${Math.floor(total / 60)} min ${total % 60} sec total`}</p>
      <div className="hang-controls">
        {(status === 'idle' || status === 'finished') && <button className="btn primary" disabled={!!error || otherTimer} onClick={begin}>Start timer</button>}
        {status === 'running' && <button className="btn primary" onClick={() => pause()}>Pause</button>}
        {status === 'paused' && <button className="btn primary" onClick={() => { resume(); setFocused(true) }}>Resume</button>}
        {locked && <button className="btn" onClick={() => setFocused(true)}>Full-screen timer</button>}
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
    {focused && createPortal(<section ref={focusPanel} className={`hang-focus phase-${colours[phaseName] || 'ready'}`} role="dialog" aria-modal="true" aria-label="Hang timer running view" onKeyDown={focusKey}>
      <header className="hang-focus-header"><button className="hang-round" aria-label="Return to timer settings and pause" onClick={leaveFocus}><Icon name="chevronLeft" /></button><div><span className="hang-brand">OpenGYM · interval timer</span><h2 aria-live="polite">{phaseName}{status === 'paused' ? ' · paused' : ''}</h2></div></header>
      <div className={`hang-focus-digits ${clock.length > 5 ? 'long' : ''}`} role="timer" aria-label="Interval time remaining">{clock}</div>
      <div className="hang-focus-next">{status === 'finished' ? 'Complete — no sets automatically logged' : `Next: ${phases[index + 1]?.kind || 'Finish'}`}</div>
      <div className="hang-focus-stats">
        <div><span>Set</span><strong>{String(phase?.set || (phase?.kind === 'Recover' || phase?.kind === 'Cool down' ? config.sets : 0)).padStart(2, '0')}<small> / {config.sets}</small></strong></div>
        <div><span>Cycle</span><strong>{String(phase?.cycle || (phase?.kind === 'Cool down' ? config.cycles : 0)).padStart(2, '0')}<small> / {config.cycles}</small></strong></div>
        <div><span>Total remaining</span><strong>{timerClock(status === 'finished' ? 0 : remainingSession(phases, index, remaining))}</strong></div>
      </div>
      <p className="hang-focus-notice" role="status">{message || 'Keep this screen open. Locking your phone pauses the timer.'}</p>
      <footer className="hang-focus-toolbar">
        <button className="hang-round" aria-label={status === 'running' ? 'Pause timer' : status === 'finished' ? 'Restart timer' : 'Resume timer'} onClick={() => status === 'running' ? pause() : status === 'finished' ? begin() : resume()}><Icon name={status === 'running' ? 'pause' : 'play'} /><span>{status === 'running' ? 'Pause' : status === 'finished' ? 'Restart' : 'Play'}</span></button>
        <button className="hang-round" aria-label="Previous interval" disabled={index === 0 || status === 'finished'} onClick={() => jump(-1)}><Icon name="chevronLeft" /><span>Previous</span></button>
        <button className="hang-round" aria-label="Next interval" disabled={index + 1 >= phases.length || status === 'finished'} onClick={() => jump(1)}><Icon name="chevronRight" /><span>Next</span></button>
        <button className="hang-round" aria-label="Reset timer" onClick={() => { if (status === 'finished' || window.confirm('Stop and reset this timer?')) reset() }}><Icon name="reset" /><span>Reset</span></button>
      </footer>
    </section>, document.body)}
  </div>
}
