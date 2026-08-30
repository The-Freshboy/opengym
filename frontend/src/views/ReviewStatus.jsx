import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { Button, Row, Section } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { syncLabel } from '../lib/sync-state.js'

const when = value => value ? new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) + ' Canberra' : 'Not recorded'
export default function ReviewStatus() {
  const nav = useNavigate(), store = useStore(), { S, user } = store
  const [data, setData] = useState(null), [error, setError] = useState('')
  const load = async () => {
    if (!user) return
    try { const result = await api('/api/diagnostics'); if (useStore.getState().user?.id === user.id) { setData(result); setError('') } }
    catch (e) { setError(e.message) }
  }
  useEffect(() => { setData(null); setError(''); load() }, [user?.id])
  return <div className="narrow"><div className="hdr"><button className="iconbtn" aria-label="Back" onClick={() => nav('/settings')}><Icon name="chevronLeft" /></button><h1 style={{ marginLeft: 10 }}>Reviews & delivery</h1></div>
    <Section title="Data status"><Row icon="check" title={syncLabel(store)} subtitle={`Last successful sync: ${when(store.lastSyncedAt)}`} /><Button onClick={() => nav('/settings/sync')}>Sync & recovery</Button></Section>
    {!user && <p>Sign in to see server status. Guest sessions are saved on this device only.</p>}
    {!!error && <p role="alert">Status unavailable: {error}</p>}
    {user && <Button onClick={load}>Refresh status</Button>}
    <Section title="Workout reminder"><Row icon="bell" title={S.reminder?.on ? `Enabled at ${S.reminder.time}` : 'Off'} subtitle={`${S.reminder?.tz || 'Device timezone'} · ${S.reminder?.timezoneMode === 'home' ? 'fixed home time' : 'travel-local time'}`} /><p className="small dim">Browser push permission and server availability are also required. Configure and send a test from Settings.</p></Section>
    <Section title="Programme version history"><p className="small dim">The ten most recent planning changes made through this version of the app. Older history cannot be reconstructed. Server recovery copies are separate.</p>{!(S.programmeHistory || []).length && <p>No planning changes recorded yet.</p>}{[...(S.programmeHistory || [])].reverse().map((version, i) => <details key={`${version.at}-${i}`} style={{ padding: 12 }}><summary>Before change on {when(version.at)}</summary><p className="small">Dated overrides changed: {version.changedDates?.join(', ') || 'None; routine or weekly-template change'}</p>{(version.previous?.routines || []).map(r => <p className="small" key={r.id}>{r.name} · {r.ex?.length || 0} exercises</p>)}<details><summary>Full previous plan</summary><pre style={{ fontSize: '.7rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(version.previous, null, 2)}</pre></details></details>)}</Section>
    {data && <>
      <Section title="Server coach"><Row icon="clock" title={data.reviewer?.schedule && data.reviewer.schedule !== 'off' ? 'Schedule configured' : 'Manual reviews only'} subtitle={`Timezone: ${data.reviewer?.timezone || 'Not configured'}`} /><p className="small">Last review: {when(data.reviewer?.lastReviewAt)}<br />Pending proposal: {data.reviewer?.pending ? 'Yes — awaiting your review' : 'No'}<br />Last outcome: {typeof data.reviewer?.lastOutcome === 'string' ? data.reviewer.lastOutcome : 'See Coach history'}</p><details><summary>Schedule details</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(data.reviewer?.schedule || 'off', null, 2)}</pre></details><p className="small dim">This runs on the OpenGYM server when its provider is available. It analyses logged information; it does not browse fresh research each run.</p><Button onClick={() => nav('/coach')}>Coach controls</Button></Section>
      <Section title="ntfy review reminder"><Row icon="bell" title={data.notifications?.configured ? (data.notifications?.weeklySummary ? 'Enabled' : 'Configured, profile reminder off') : 'Not configured'} subtitle={`${data.notifications?.nextSchedule || 'Sunday 19:00'} · ${data.notifications?.timezone || 'Australia/Sydney'}`} /><p className="small">Last delivery day: {data.notifications?.lastSentDay || 'Not recorded'}<br />Last error: {data.notifications?.lastError || 'None recorded'}</p><p className="small dim">A reminder means it is time to review, not that a research review has completed. Private health details are not included in this status screen.</p><Button onClick={() => nav('/personal')}>Reminder preference</Button></Section>
      <Section title="Restricted external reviewer"><Row icon="shield" title={data.integrations?.enabled ? 'API enabled' : 'API disabled'} subtitle="Private network boundary: not verified by this screen" /><p className="small">A credential does not install a schedule. An external desktop review still depends on the computer running it being available.</p><Button onClick={() => nav('/settings/integrations')}>Connections & approvals</Button></Section>
      <Section title="Recovery & build"><Row icon="history" title={`${data.snapshots?.count || 0} server recovery copies`} subtitle={`Latest: ${when(data.snapshots?.latestAt)}`} /><p className="small">Build: {data.build || 'Not supplied by this deployment'}. Restore drill: not verified here. Recovery copies on the same server are not off-host backups.</p></Section>
    </>}
  </div>
}
