import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

const when = value => value ? new Date(value).toLocaleString() : 'Unknown time'

export default function SyncRecovery() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const { user, syncConflict, resolveSyncConflict, replaceState } = useStore()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = () => user && api('/api/data/snapshots').then(setData).catch(e => toast(e.message))
  useEffect(load, [user])
  const restore = async snap => {
    if (!window.confirm(`Restore the backup from ${when(snap.createdAt)}? Your current server copy will be backed up first.`)) return
    setBusy(true)
    try {
      const result = await api('/api/data/snapshots/restore', { method: 'POST', body: JSON.stringify({ id: snap.id, baseRevision: data.current.revision }) })
      localStorage.setItem('gym_server_revision', String(result.revision))
      replaceState(result.state, false)
      toast('Backup restored')
      await load()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }
  return <div className="page">
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/settings')} aria-label="Back"><Icon name="chevronLeft" /></button><div style={{ flex: 1, marginLeft: 10 }}><h1>Sync & recovery</h1><p>Your server copies and device conflicts</p></div></div>
    {syncConflict && <Section title="Needs your choice">
      <div className="card" style={{ padding: 16 }}><b>This profile changed on another device</b><p className="dim">Choose which copy OpenGym should keep. Your server copy is protected by an automatic snapshot.</p><Button variant="primary" onClick={() => resolveSyncConflict('server')}>Use server copy</Button><div style={{ height: 8 }} /><Button onClick={() => resolveSyncConflict('local')}>Keep this device’s copy</Button></div>
    </Section>}
    <Section title="Server status">
      <Row icon="check" iconTint="var(--green)" title={user ? 'Signed in and syncing' : 'Not signed in'} subtitle={data?.current?.updatedAt ? `Last server update: ${when(data.current.updatedAt)}` : 'No server copy yet'} />
    </Section>
    <Section title="Recovery copies">
      {!data && <div className="empty">Loading…</div>}
      {data && !data.snapshots.length && <div className="empty">Recovery copies appear after your next synced change.</div>}
      {(data?.snapshots || []).map(s => <Row key={s.id} icon="history" iconTint="var(--blue)" title={when(s.createdAt)} subtitle={`Revision ${s.revision} · ${s.id.startsWith('daily-') ? 'daily backup' : 'recent change'}`} accessory="chevron" onClick={() => !busy && restore(s)} />)}
    </Section>
  </div>
}
