import { weeklyDashboard } from '../lib/weekly-dashboard.js'
import { hangContextLabel } from '../lib/training-log.js'
import { Button } from './ui.jsx'

const minutes = n => Math.round(n * 10) / 10
export default function WeeklyDashboard({ state, today, onInsights }) {
  const week = weeklyDashboard(state, today)
  return <section className="card" aria-labelledby="weekly-training-title">
    <h2 id="weekly-training-title">This week · {week.from}</h2>
    <p className="small dim">Monday to {week.to}. Logged activity, not a fitness or recovery score. Copied history is excluded.</p>
    <div className="personal-metrics">
      <span><strong>{week.sessions}</strong> completed sessions</span>
      <span><strong>{minutes(week.runningMinutes)}</strong> running minutes logged</span>
      <span><strong>{week.climbingSessions}</strong> climbing sessions</span>
      <span><strong>{week.hangs.length}</strong> working hangs logged</span>
    </div>
    {!!week.partial && <p className="small">Also logged: {week.partial} partial session{week.partial === 1 ? '' : 's'}. Their completed work is included in activity totals.</p>}
    <p className="small dim">Previous full week: {week.previous.sessions} completed sessions · {minutes(week.previous.runningMinutes)} running minutes · {week.previous.climbingSessions} climbing sessions. This week may still be in progress.</p>
    {!!week.otherCardioMinutes && <p className="small">{minutes(week.otherCardioMinutes)} other or unspecified cardio minutes are kept separate. Treadmill walking, mixed walk/run and unspecified cardio are not assumed to be running.</p>}
    <details><summary>Hang progress by exercise and assistance</summary>
      {!week.hangGroups.length && <p className="small dim">No completed working hangs with a duration logged this week. Timer use and planned holds do not count.</p>}
      {week.hangGroups.map(h => <div className="personal-history-row" key={h.key}>
        <b>{h.name} · {h.assistance === 'unknown' ? 'Assistance not specified' : h.assistance === 'assisted' ? 'Assisted' : 'Unassisted'}</b>
        <p className="small">{h.count} hold{h.count === 1 ? '' : 's'} · longest {h.best} seconds{h.previousBest !== null ? ` · previous week, same recorded conditions: ${h.previousBest} seconds` : ' · no matching comparison last week'}</p>
        {hangContextLabel(h.context) && <p className="small dim">{hangContextLabel(h.context)}</p>}
        <p className="small dim">{h.load === null ? 'Load not recorded' : `Recorded load: ${h.load} ${h.unit}`}{h.equipment ? ` · ${h.equipment}` : ''}</p>
      </div>)}
      <p className="small dim">Different exercises, grips, assistance, equipment and loads stay separate. Unknown assistance is not an unassisted result. Practice holds do not establish a test pass; use your goal’s test log.</p>
    </details>
    <p className="small dim">Minutes use recorded activity durations or completed cardio sets, not total gym-session time. Missing durations are not estimated.</p>
    <Button onClick={onInsights}>Training insights</Button>
  </section>
}
