import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { Button, Section, TextField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const when = value => value ? new Date(value).toLocaleString('en-AU') : 'Never'
const post = (path, body) => api('/api/health-connect' + path, { method: 'POST', body: JSON.stringify(body) })

export default function HealthConnect() {
  const nav = useNavigate(), user = useStore(s => s.user)
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [name, setName] = useState('GrapheneOS phone'), [days, setDays] = useState('180'), [credential, setCredential] = useState(''), [show, setShow] = useState(false)
  const load = async () => { try { setData(await api('/api/health-connect')); setError('') } catch (e) { setError(e.message) } }
  useEffect(() => { if (user) load() }, [user?.id])
  const run = async fn => { setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const latest = (data?.daily || []).slice(-7).reverse()
  return <div className="narrow">
    <div className="hdr"><button className="iconbtn" aria-label="Back to Settings" onClick={() => nav('/settings')}><Icon name="chevronLeft" /></button><div style={{ marginLeft: 10 }}><h1>Health Connect</h1><p>Private phone-to-server sync</p></div></div>
    {!user ? <Section title="Sign in first"><p>Health records can only be attached to a signed-in profile.</p></Section> : <>
      <p className="small muted">The companion reads only the categories you approve in Android. OpenGym does not request or store GPS routes. Garmin credentials never leave Garmin Connect.</p>
      {error && <div className="card" role="alert" style={{ padding: 16, marginBottom: 16 }}>{error}</div>}
      <Section title="Connect an Android phone"><div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <label>Phone name<TextField value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
        <label>Credential expires<select className="field" value={days} onChange={e => setDays(e.target.value)}>{[30, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}</select></label>
        <Button variant="primary" disabled={busy || !!credential || !name.trim()} onClick={() => run(async () => { const result = await post('/credentials', { name, expiresInDays: Number(days) }); setCredential(result.token); await load() })}>Create mobile credential</Button>
        {credential && <div className="card" style={{ padding: 12 }}><p className="small">Shown once. Enter the server URL and this credential in the companion app, then hide it.</p><TextField type={show ? 'text' : 'password'} value={credential} readOnly autoComplete="off" /><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><Button onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</Button><Button onClick={() => navigator.clipboard.writeText(credential)}>Copy</Button><Button onClick={() => { setCredential(''); setShow(false) }}>Done</Button></div></div>}
      </div></Section>
      <Section title="Connected phones">{!data?.credentials?.length && <p className="small">No phones connected.</p>}{(data?.credentials || []).map(item => <div className="card" key={item.id} style={{ padding: 16, marginBottom: 8 }}><b>{item.name}</b><p className="small dim">Last used {when(item.lastUsedAt)} · expires {when(item.expiresAt)}{item.revokedAt ? ` · revoked ${when(item.revokedAt)}` : ''}</p>{!item.revokedAt && <Button disabled={busy} onClick={() => run(async () => { await post('/revoke', { id: item.id }); await load() })}>Revoke</Button>}</div>)}</Section>
      <Section title="AI Coach consent"><div style={{ padding: 16 }}><label style={{ display: 'flex', gap: 10 }}><input type="checkbox" checked={!!data?.consent?.shareWithCoach} onChange={e => run(async () => { await post('/consent', { shareWithCoach: e.target.checked }); await load() })} />Share a 14-day summary with AI Coach reviews</label><p className="small dim">Off by default. Only daily summaries are added to a review; raw samples, source IDs and GPS are excluded. Coach suggestions still require your approval.</p></div></Section>
      <Section title="Sync status"><div className="card" style={{ padding: 16 }}><b>{data?.recordCount || 0} retained records</b><p className="small dim">Last import: {when(data?.lastImport?.at)}{data?.lastImport ? ` · ${data.lastImport.received} received, ${data.lastImport.inserted} new` : ''}</p></div></Section>
      <Section title="Last 7 days">{!latest.length && <p className="small">No Health Connect data imported yet.</p>}{latest.map(day => <div className="card" key={day.date} style={{ padding: 12, marginBottom: 8 }}><b>{day.date}</b><div className="small">{[day.steps && `${day.steps} steps`, day.distanceKm && `${day.distanceKm} km`, day.exerciseMinutes && `${day.exerciseMinutes} active min`, day.sleepMinutes && `${Math.round(day.sleepMinutes / 6) / 10} h sleep`, day.restingHeartRate && `${day.restingHeartRate} resting bpm`, day.hrvMs && `${day.hrvMs} ms HRV`, day.weightKg && `${day.weightKg} kg`].filter(Boolean).join(' · ') || 'No summary metrics'}</div></div>)}</Section>
      <p className="small dim">Health metrics are informational and are not a diagnosis or injury-risk score.</p>
    </>}
  </div>
}
