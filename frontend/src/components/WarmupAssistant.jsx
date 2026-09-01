import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { warmupRamp, insertWarmups } from '../lib/workout-tools.js'
import { NumberField, Button } from './ui.jsx'

export default function WarmupAssistant({ index }) {
  const { S, update } = useStore(), entry = S.active.entries[index]
  const profile = S.active.trainingContext?.equipmentProfile
  const initial = warmupRamp(entry, profile?.increment || 2.5)
  const [sets, setSets] = useState(initial)
  if (!initial.length || entry.sets.some(s => s.done)) return null
  const change = (i, key, value) => setSets(rows => rows.map((row, j) => j === i ? { ...row, [key]: value } : row))
  return <details><summary>Warm-up load assistant</summary>
    <p className="small dim">Starting calculation only: 50% then 75% of the first working weight, rounded to the selected location’s increment. Edit or ignore it based on your own warm-up and EP guidance.</p>
    {sets.map((set, i) => <div className="row" key={i} style={{ gap: 8, margin: '8px 0' }}><label className="grow">Weight ({S.unit})<NumberField value={set.w} onChange={v => change(i, 'w', v)} /></label><label className="grow">Reps<NumberField decimal={false} value={set.r} onChange={v => change(i, 'r', Math.round(v))} /></label></div>)}
    <Button disabled={!sets.length} onClick={() => update(s => insertWarmups(s.active.entries[index], sets))}>Insert editable warm-up sets</Button>
    <p className="small dim">Warm-ups are marked W and excluded from working-set records and progression.</p>
  </details>
}
