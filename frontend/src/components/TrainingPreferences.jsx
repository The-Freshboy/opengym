import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { Button, Row, Section, SelectRow, TextField, TextArea } from './ui.jsx'

export default function TrainingPreferences() {
  const S = useStore(s => s.S), update = useStore(s => s.update)
  const prefs = S.trainingPreferences || {}, profiles = prefs.equipmentProfiles || []
  const [draft, setDraft] = useState(null)
  const patch = change => update(s => { s.trainingPreferences = { ...s.trainingPreferences, ...change } })
  const save = () => {
    if (!draft?.name.trim()) return
    const plateValues = (Array.isArray(draft.plates) ? draft.plates : String(draft.plates || '').split(',')).map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 100)
    const value = { ...draft, name: draft.name.trim(), equipment: draft.equipment.trim(), notes: draft.notes.trim(), plates: [...new Set(plateValues)].sort((a, b) => b - a), barWeight: Number(draft.barWeight) > 0 ? Number(draft.barWeight) : undefined }
    patch({ equipmentProfiles: [...profiles.filter(p => p.id !== value.id), value] })
    setDraft(null)
  }
  return <Section title="Training preferences" footer="Equipment context is recorded with new sessions. Switching location does not change your weights, substitute exercises or remove mandatory work.">
    <SelectRow icon="dumbbell" title="Training location" value={prefs.activeEquipmentProfileId || ''} onChange={value => patch({ activeEquipmentProfileId: value })}
      options={[{ value: '', label: 'Not specified' }, ...profiles.map(p => ({ value: p.id, label: p.name }))]} />
    <SelectRow icon="clock" title="Usual session length" value={prefs.sessionMinutes || 60} onChange={value => patch({ sessionMinutes: value })}
      options={[20, 30, 45, 60, 75, 90].map(value => ({ value, label: `${value} minutes` }))} />
    <SelectRow icon="list" title="New-session preference" value={prefs.sessionMode || 'full'} onChange={value => patch({ sessionMode: value })}
      options={[{ value: 'full', label: 'Full session' }, { value: 'short', label: 'Short — review optional omissions' }]} />
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      {profiles.map(p => <div key={p.id}><b>{p.name}</b><p className="small">{p.equipment || 'No equipment listed'}{p.increment ? ` · Usual increment ${p.increment} ${p.unit || 'kg'}` : ''}</p><p className="small dim">{p.notes}</p><Button size="sm" onClick={() => setDraft({ equipment: '', notes: '', ...p })}>Edit</Button></div>)}
      {!draft && <Button disabled={profiles.length >= 12} onClick={() => setDraft({ id: crypto.randomUUID(), name: '', equipment: '', notes: '', increment: '', unit: S.unit || 'kg', plates: '', barWeight: S.unit === 'lb' ? 45 : 20 })}>Add home / gym / travel profile</Button>}
      {draft && <fieldset style={{ display: 'grid', gap: 12 }}><legend>Equipment profile</legend>
        <label>Name<TextField value={draft.name} maxLength={80} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Available equipment and machine identity<TextArea value={draft.equipment} maxLength={1000} onChange={e => setDraft({ ...draft, equipment: e.target.value })} /></label>
        <label>Usual weight increment ({draft.unit})<TextField type="number" min="0" max="100" step="0.25" value={draft.increment} onChange={e => setDraft({ ...draft, increment: e.target.value })} /></label>
        <label>Bar weight ({draft.unit})<TextField type="number" min="0" max="100" step="0.25" value={draft.barWeight ?? ''} onChange={e => setDraft({ ...draft, barWeight: e.target.value })} /></label>
        <label>Available plate sizes, comma-separated<TextField inputMode="decimal" placeholder="25, 20, 15, 10, 5, 2.5, 1.25" value={Array.isArray(draft.plates) ? draft.plates.join(', ') : draft.plates || ''} onChange={e => setDraft({ ...draft, plates: e.target.value })} /></label>
        <label>Setup and substitution notes<TextArea value={draft.notes} maxLength={1000} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
        <p className="small dim">Notes are not automatic substitutions. Different machines and bands are not equivalent loads.</p>
        <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => setDraft(null)}>Cancel</Button><Button variant="primary" disabled={!draft.name.trim() || (draft.increment !== '' && (!Number.isFinite(Number(draft.increment)) || Number(draft.increment) < 0 || Number(draft.increment) > 100)) || (draft.barWeight !== '' && (!Number.isFinite(Number(draft.barWeight)) || Number(draft.barWeight) <= 0 || Number(draft.barWeight) > 100))} onClick={save}>Save profile</Button></div>
      </fieldset>}
    </div>
    <Row icon="calendar" title="Workout reminder timezone" subtitle={S.reminder?.timezoneMode === 'home' ? 'Canberra — follows daylight saving, not your device location' : 'Updates to device timezone when you open the app'} />
    <SelectRow icon="globe" title="Timezone behaviour" value={S.reminder?.timezoneMode || 'local'} onChange={value => update(s => { s.reminder = { ...s.reminder, timezoneMode: value, tz: value === 'home' ? 'Australia/Sydney' : Intl.DateTimeFormat().resolvedOptions().timeZone } })}
      options={[{ value: 'home', label: 'Fixed home — Canberra' }, { value: 'local', label: 'Travel — device local time' }]} />
  </Section>
}
