import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore, DEF } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { useUI } from '../store/useUI.js'
import { Button, Section, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { sameIntegrationState } from '../lib/integration-review.js'

const when = value => value ? new Date(value).toLocaleString('en-AU') : 'Never'
const post = (path, body) => api('/api/integrations' + path, { method: 'POST', body: JSON.stringify(body) })
const labels = { routines: 'Routine', customEx: 'Exercise', week: 'Weekly schedule', dayPlan: 'Dated schedule', exWeights: 'Starting weights' }
const categoryLabels = { goals: 'Goals, deadlines and recorded test results', readiness: 'Readiness and symptom information (sensitive)', instructions: 'Exercise notes and training restrictions (sensitive)' }
const prescription = value => {
  if (value == null) return 'Not scheduled / removed'
  if (Array.isArray(value)) return value.join(', ') || 'Rest day'
  if (typeof value !== 'object') return String(value)
  const v = value.prescription || value
  return [v.sets != null && `${v.sets} sets`, v.sec != null && `${v.sec} seconds`, v.reps != null && `${v.reps} reps`, v.min != null && `${v.min} minutes`, v.mandatory && 'Protected base exercise', v.optional && 'Optional', v.prog === 'off' && 'Automatic progression off', v.note].filter(Boolean).join(' · ') || 'See full details below'
}

export default function Integrations() {
  const nav = useNavigate(), user = useStore(s => s.user), toast = useUI(s => s.toast)
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [name, setName] = useState('Personal programme reviewer'), [allowProposals, setAllowProposals] = useState(false)
  const [days, setDays] = useState('30'), [credential, setCredential] = useState(''), [show, setShow] = useState(false)
  const [preview, setPreview] = useState(null), [confirmed, setConfirmed] = useState(false)
  const [categories, setCategories] = useState([])
  const load = async () => {
    try { const next = await api('/api/integrations'); setData(next); setError('') }
    catch (e) { setError(e.message) }
  }
  useEffect(() => { setData(null); setCredential(''); setPreview(null); if (user) load() }, [user?.id])
  const run = async action => {
    setBusy(true); setError('')
    try { await action() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const create = () => run(async () => {
    const result = await post('', { name: name.trim(), allowProposals, expiresInDays: Number(days), categories })
    setCredential(result.token); setShow(false); await load()
  })
  const review = proposal => run(async () => {
    if (useStore.getState().S.active) throw new Error('Finish or save your active workout before reviewing programme changes.')
    await useStore.getState().pullState()
    if (useStore.getState().syncConflict || localStorage.getItem('gym_dirty') === '1' || useStore.getState().syncStatus !== 'synced') throw new Error('Resolve your sync conflict or connection problem in Sync & recovery first.')
    const current = await api('/api/data')
    if (!sameIntegrationState({ ...DEF, ...current.state }, useStore.getState().S)) throw new Error('Your programme changed while opening this review. Open it again to compare the latest copy.')
    if (current.revision !== proposal.revision) throw new Error('This proposal is out of date. Reject it, then ask the integration to review your latest programme.')
    setPreview({ proposal, current, localState: JSON.stringify(useStore.getState().S), changes: proposal.changes.map(c => {
      const routine = current.state?.routines?.find(r => r.id === c.target.routineId)
      const exercise = c.target.exId ? exOr(c.target.exId).n : c.after?.exercise?.n
      const field = c.type === 'week' ? 'week' : c.type === 'day-plan' ? 'dayPlan' : 'routines'
      return { ...c, key: c.id, field, label: [c.type.replaceAll('-', ' '), routine?.name || c.target.weekday || c.target.routineId, exercise, c.target.date].filter(x => x !== undefined && x !== null && x !== '').join(' / ') }
    }) })
    setConfirmed(false)
  })
  const approve = () => run(async () => {
    await useStore.getState().approveIntegrationProposal({ id: preview.proposal.id, revision: preview.current.revision, localState: preview.localState })
    setPreview(null); await load(); toast('Programme changes approved and saved. A server recovery copy was created.')
  })
  return <div className="narrow">
    <div className="hdr"><button className="iconbtn" aria-label="Back to Settings" onClick={() => nav('/settings')}><Icon name="chevronLeft" /></button><div style={{ marginLeft: 10 }}><h1>Restricted integrations</h1><p>Access for your profile only</p></div></div>
    {!user ? <Section title="Sign in first"><p>Guest data cannot be connected. Sign in with your passkey in Settings.</p><Button onClick={() => nav('/settings')}>Open Settings</Button></Section> : <>
      <p className="small muted">Read access shares training information, including workout comments, with the tool you connect. It cannot manage accounts, admin settings or delete workout history. Optional proposals still require your approval here.</p>
      <p className="small dim">This does not configure a scheduled reviewer or enforce Tailscale access. Keep credentials in a secure secret store; never paste them into a chat or put them in a URL.</p>
      {!!error && <div className="card" role="alert" style={{ padding: 16, marginBottom: 16 }}>{error}<div style={{ marginTop: 10 }}><Button disabled={busy} onClick={() => run(load)}>Retry</Button></div></div>}
      {!data && !error && <p>Loading integrations…</p>}
      {data && <>
        <Section title="Create a connection">
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <label>Connection name<TextField value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
            <label>Expires after<select className="field" value={days} onChange={e => setDays(e.target.value)}>{[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}</select></label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={allowProposals} onChange={e => setAllowProposals(e.target.checked)} />Allow programme proposals (never automatic changes)</label>
            <fieldset><legend>Additional information to share — optional</legend>{Object.entries(categoryLabels).map(([key, label]) => <label key={key} style={{ display: 'block', padding: 8 }}><input type="checkbox" checked={categories.includes(key)} onChange={e => setCategories(e.target.checked ? [...categories, key] : categories.filter(x => x !== key))} /> {label}</label>)}</fieldset>
            <p className="small dim">Read-only is the default. Anyone with the credential has its permissions until it expires or you revoke it.</p>
            <Button variant="primary" disabled={busy || !name.trim() || !!credential} onClick={create}>Create {allowProposals ? 'proposal-enabled' : 'read-only'} connection</Button>
          </div>
        </Section>
        {credential && <Section title="Save this credential once">
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <p className="small">This is the only time it can be shown. Save it securely before leaving. OpenGYM does not save the plain credential in your browser storage.</p>
            <TextField aria-label="New integration credential" type={show ? 'text' : 'password'} value={credential} readOnly autoComplete="off" spellCheck={false} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Button onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</Button><Button onClick={() => run(async () => { await navigator.clipboard.writeText(credential); toast('Copied. Save securely; clear your clipboard afterwards.') })}>Copy credential</Button><Button onClick={() => { setCredential(''); setShow(false) }}>Done — hide permanently</Button></div>
          </div>
        </Section>}
        <Section title="Connections">
          {!data.tokens?.length && <p className="small">No connections yet.</p>}
          {(data.tokens || []).map(token => <div className="card" key={token.id} style={{ padding: 16, marginBottom: 10 }}>
            <h3>{token.name}</h3><p className="small">{token.scopes?.includes('propose') ? 'Read + propose changes' : 'Read only'} · Expires {when(token.expiresAt)}</p><p className="small dim">Last used: {when(token.lastUsedAt)}{token.revokedAt ? ` · Revoked ${when(token.revokedAt)}` : ''}</p>
            {!token.revokedAt && <Button disabled={busy} onClick={() => run(async () => { await post('/revoke', { id: token.id }); await load(); toast('Connection revoked') })}>Revoke access</Button>}
          </div>)}
        </Section>
        <Section title="Proposed programme changes">
          {!data.pending?.length && <p className="small">No changes awaiting approval.</p>}
          {(data.pending || []).map(proposal => <div className="card" key={proposal.id} style={{ padding: 16, marginBottom: 10 }}><h3>{proposal.title || proposal.summary || 'Programme proposal'}</h3><p className="small dim">Submitted {when(proposal.createdAt)}</p><p className="small">{proposal.reason || proposal.rationale}</p><div style={{ display: 'flex', gap: 8 }}><Button disabled={busy} onClick={() => review(proposal)}>Review changes</Button><Button disabled={busy} onClick={() => run(async () => { await post('/proposals/reject', { id: proposal.id }); setPreview(null); await load() })}>Reject</Button></div></div>)}
          {preview && <div className="card" style={{ padding: 16 }}>
            <h3>Review every change</h3><p className="small">Workout history and account settings will be preserved. The descriptions below come from the connected tool; they are suggestions, not verified clinical advice.</p>
            {preview.changes.map(change => <div key={change.key} style={{ marginBottom: 20 }}><h4>{labels[change.field]}: {change.label}</h4><p className="small"><b>Before:</b> {prescription(change.before)}<br /><b>After:</b> {prescription(change.after)}</p><p className="small"><b>Reason from reviewer:</b> {change.why || 'No reason supplied'}</p><details><summary>Full technical comparison</summary><div style={{ display: 'grid', gap: 8, marginTop: 8 }}><div><b>Before</b><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '.75rem' }}>{change.before === undefined ? 'Not present' : JSON.stringify(change.before, null, 2)}</pre></div><div><b>After</b><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '.75rem' }}>{change.after === undefined ? 'Removed' : JSON.stringify(change.after, null, 2)}</pre></div></div></details></div>)}
            <label style={{ display: 'flex', gap: 10, marginBottom: 14 }}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I have reviewed these changes and want to apply them.</label>
            <div style={{ display: 'flex', gap: 8 }}><Button disabled={busy} onClick={() => setPreview(null)}>Cancel</Button><Button variant="primary" disabled={busy || !confirmed || !preview.changes.length} onClick={approve}>Approve programme changes</Button></div>
          </div>}
        </Section>
        <Section title="Recent access and changes">
          {!data.audit?.length && <p className="small">No events recorded.</p>}
          {(data.audit || []).map((event, i) => <div key={event.id || i} style={{ padding: '10px 16px' }}><div>{event.action}</div><div className="small dim">{when(event.at || event.createdAt)}{event.tokenName ? ` · ${event.tokenName}` : ''}</div></div>)}
        </Section>
        <Button onClick={() => nav('/settings/sync')}>Open Sync & recovery</Button>
      </>}
    </>}
  </div>
}
