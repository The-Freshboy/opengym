import { backupComparison } from '../lib/recovery.js'
import { Button } from './ui.jsx'

export default function BackupPreview({ current, incoming, onCancel, onRestore, busy = false }) {
  const x = backupComparison(current, incoming)
  return <section className="card"><h3>Review full restore</h3><p className="small">This replaces your training data and preferences. It does not change your passkey or account permissions. In-progress workouts are not restored.</p><table style={{ width: '100%', textAlign: 'left', margin: '12px 0' }}><thead><tr><th>Data</th><th>Current</th><th>Backup</th></tr></thead><tbody>{[['routines', 'Routines'], ['workouts', 'Workouts'], ['weighIns', 'Weigh-ins'], ['goals', 'Goals'], ['results', 'Test results']].map(([key, label]) => <tr key={key}><th>{label}</th><td>{x.before[key]}</td><td>{x.after[key]}</td></tr>)}</tbody></table><p className="small">Latest workout: {x.before.latestWorkout} → {x.after.latestWorkout}</p><p className="small">{x.removedWorkouts} current workout records are absent from this backup. Matching records and settings may also change.</p><div className="row"><Button disabled={busy} onClick={onCancel}>Cancel</Button><Button disabled={busy} variant="danger" onClick={onRestore}>Restore this backup</Button></div></section>
}
