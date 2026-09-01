import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { plateLoading } from '../lib/workout-tools.js'
import { NumberField } from './ui.jsx'

export default function PlateCalculator({ target = 0 }) {
  const S = useStore(s => s.S)
  const profile = S.active?.trainingContext?.equipmentProfile
  const saved = profile?.plates?.length ? profile.plates : (S.unit === 'lb' ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25])
  const defaultBar = profile?.barWeight || (S.unit === 'lb' ? 45 : 20)
  const [total, setTotal] = useState(target || defaultBar), [bar, setBar] = useState(defaultBar)
  const result = plateLoading(total, bar, saved)
  return <details><summary>Plate calculator</summary>
    <div className="row" style={{ gap: 8 }}><label className="grow">Total ({S.unit})<NumberField value={total} onChange={setTotal} /></label><label className="grow">Bar ({S.unit})<NumberField value={bar} onChange={setBar} /></label></div>
    <p><b>Each side:</b> {result.perSide.length ? result.perSide.join(' + ') + ` ${S.unit}` : 'no plates'}</p>
    <p className="small">Loaded total: {result.loaded} {S.unit}.{result.remainder > 0 ? ` Cannot make the remaining ${result.remainder} ${S.unit} with your listed plates.` : ' Exact match.'}</p>
    <p className="small dim">Calculator only. Confirm the bar and plate markings; machine stacks and bands are not converted.</p>
  </details>
}
