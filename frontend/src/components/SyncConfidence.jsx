import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'

export default function SyncConfidence({ compact = false }) {
  const { S, user, syncStatus, syncConflict, lastSyncedAt, localSaveError, lastLocalSaveAt, pushState } = useStore()
  const nav = useNavigate()
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  useEffect(() => { const changed = () => setOnline(navigator.onLine); window.addEventListener('online', changed); window.addEventListener('offline', changed); return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed) } }, [])
  const status = localSaveError ? 'Local save failed — protect your data' : syncConflict ? 'Sync needs your choice' : !user ? 'Device-only profile' : !online ? 'Offline — server sync unavailable' : ({ pending: 'Changes waiting to sync', syncing: 'Syncing…', synced: 'Synced with server', error: 'Server sync failed' }[syncStatus] || 'Server sync not yet confirmed')
  return <details className="card" open={localSaveError || syncConflict || undefined}><summary>{status}</summary>
    {localSaveError ? <p role="alert">{localSaveError}. Keep this tab open and export a backup from Settings before troubleshooting browser storage.</p> : <p className="small">{lastLocalSaveAt ? `Last successful save on this device: ${new Date(lastLocalSaveAt).toLocaleString()}.` : 'No new local save confirmed in this tab yet.'} Browser storage can be cleared; keep backups.</p>}
    <p className="small">{lastSyncedAt ? `Last server confirmation: ${new Date(lastSyncedAt).toLocaleString()}.` : 'No server confirmation in this tab yet.'} {!user && 'Sign-in is required to sync between devices.'}</p>
    {user && online && !syncConflict && ['error', 'pending', 'unknown'].includes(syncStatus) && <button className="btn" onClick={() => pushState()}>Retry sync</button>}
    <button className="btn" onClick={() => nav(syncConflict ? '/settings/sync' : '/settings')}>{syncConflict ? 'Review sync conflict' : 'Backups and sync settings'}</button>
    {!compact && S.active && <><p>Unfinished {S.active.editingWorkoutId ? 'workout edit' : 'workout'}: {S.active.name}. Your recorded sets are still available.</p><button className="btn" onClick={() => nav('/workout')}>Resume workout</button></>}
  </details>
}
