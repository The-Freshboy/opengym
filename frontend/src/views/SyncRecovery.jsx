import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Button, Row, Section } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import BackupPreview from '../components/BackupPreview.jsx'
import { DEF } from '../store/useStore.js'
import { syncLabel } from '../lib/sync-state.js'

const when = value => value ? new Date(value).toLocaleString() : 'Unknown time'

export default function SyncRecovery() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const { user, syncStatus, syncError, lastSyncedAt, syncConflict, resolveSyncConflict, replaceState } = useStore()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const load = async () => {
    if (!user) return
    const id = user.id
    try { const result = await api('/api/data/snapshots'); if (useStore.getState().user?.id === id) { setData(result); setError('') } }
    catch (e) { if (useStore.getState().user?.id === id) setError(e.message) }
  }
  useEffect(() => { setData(null); setPreview(null); setError(''); load() }, [user?.id])
  const resolve = choice => { try { resolveSyncConflict(choice) } catch (e) { toast(e.message) } }
  const openPreview = async snap => {
    if (useStore.getState().S.active) return toast('Finish or save your active workout before restoring.')
    setBusy(true)
    try {
      await useStore.getState().pullState()
      if (useStore.getState().syncConflict || localStorage.getItem('gym_dirty') === '1') throw new Error('Resolve the sync conflict or connection problem before restoring.')
      const [saved, current] = await Promise.all([api('/api/data/snapshots/preview', { method: 'POST', body: JSON.stringify({ id: snap.id }) }), api('/api/data')])
      setPreview({ ...saved, current, localStamp: useStore.getState().S._ts, localState: JSON.stringify(useStore.getState().S) })
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }
  const restore = async snap => {
    if (!preview || useStore.getState().S.active || useStore.getState().S._ts !== preview.localStamp) return toast('Your local data changed. Open the preview again.')
    setBusy(true)
    try {
      await useStore.getState().restoreSnapshot({ id: snap.id, revision: preview.current.revision, localState: preview.localState })
      setPreview(null)
      toast('Backup restored')
      await load()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }
  return <div className="page">
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/settings')} aria-label="Back"><Icon name="chevronLeft" /></button><div style={{ flex: 1, marginLeft: 10 }}><h1>Sync & recovery</h1><p>Your server copies and device conflicts</p></div></div>
    {syncConflict && <Section title="Needs your choice">
      <div className="card" style={{ padding: 16 }}><b>This profile changed on another device</b><p className="dim">Choose which copy OpenGym should keep. Both branches are retained on this device when you choose; the server also keeps recovery snapshots. Export a backup before replacing important data.</p><p className="small">Device: {syncConflict.local?.workouts?.length || 0} workouts · Server: {syncConflict.server.state?.workouts?.length || 0} workouts</p><Button variant="primary" onClick={() => resolve('server')}>Use server copy</Button><div style={{ height: 8 }} /><Button onClick={() => resolve('local')}>Keep this device’s copy</Button></div>
    </Section>}
    <Section title="Server status">
      <Row icon="check" iconTint="var(--green)" title={syncLabel({ user, syncStatus, syncConflict })} subtitle={lastSyncedAt ? `Last successful sync: ${when(lastSyncedAt)}` : 'No successful sync verified this session'} />
      {!!syncError && <p role="alert">{syncError}</p>}
      {user && <Button disabled={busy || !!syncConflict} onClick={async () => { setBusy(true); try { await useStore.getState().pullState(); await load() } finally { setBusy(false) } }}>Retry sync</Button>}
    </Section>
    <Section title="Recovery copies">
      {!user && <p className="small">Sign in to access server recovery copies. Guest data can be exported from Settings.</p>}
      {error && <div role="alert"><p>Could not load recovery copies: {error}</p><Button onClick={load}>Retry loading copies</Button></div>}
      {user && !data && !error && <div className="empty">Loading…</div>}
      {preview && <BackupPreview current={preview.current.state} incoming={preview.state} busy={busy} onCancel={() => setPreview(null)} onRestore={() => restore(preview)} />}
      {data && !data.snapshots.length && <div className="empty">Recovery copies appear after your next synced change.</div>}
      {(data?.snapshots || []).map(s => <Row key={s.id} icon="history" iconTint="var(--blue)" title={when(s.createdAt)} subtitle={`Revision ${s.revision} · ${s.id.startsWith('daily-') ? 'daily backup' : 'recent change'}`} accessory="chevron" onClick={() => !busy && openPreview(s)} />)}
      <p className="small dim">These recovery copies share the server’s storage. Keep independent host/off-site backups for hardware failure. Ten recent changes and thirty daily copies are retained.</p>
    </Section>
  </div>
}
