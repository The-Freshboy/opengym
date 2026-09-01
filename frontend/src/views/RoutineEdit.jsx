import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { uid } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { supersetUnits, cleanupSg, exLine, routineIds } from '../lib/history.js'
import { Thumb } from '../components/Media.jsx'
import { glyphPicker, exercisePicker, exConfigSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { Button, SelectRow } from '../components/ui.jsx'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../lib/progression.js'
import BodyMap from '../components/BodyMap.jsx'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'

export default function RoutineEdit() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const r = S.routines.find(x => x.id === id)
  useEffect(() => { if (!r) nav('/plan') }, [!!r])
  if (!r) return null

  const edit = fn => update(s => { fn(s.routines.find(x => x.id === id).ex) })
  const move = (i, dir) => edit(ex => { const j = i + dir; if (j < 0 || j >= ex.length) return;[ex[i], ex[j]] = [ex[j], ex[i]]; cleanupSg(ex) })
  const toggleLink = i => edit(ex => {
    if (i < 1) return
    const cur = ex[i], prev = ex[i - 1]
    if (cur.sg && prev.sg && cur.sg === prev.sg) delete cur.sg
    else { const gid = prev.sg || ('sg' + uid()); prev.sg = gid; cur.sg = gid }
    cleanupSg(ex)
  })

  const units = supersetUnits(r.ex)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const inSS = new Set(units.filter(u => u.length > 1).flat())

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/plan')} aria-label={t('Plan')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, margin: '0 12px' }}>
        <input className="input" defaultValue={r.name} style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.021em' }}
          onChange={e => update(s => { s.routines.find(x => x.id === id).name = e.target.value.trim() || t('Routine') })} />
      </div>
      <button className="iconbtn" aria-label={t('Pick an icon')} onClick={() => glyphPicker(r.emoji, g => update(s => { s.routines.find(x => x.id === id).emoji = g }))}><Icon name={glyphOf(r.emoji)} /></button>
    </div>

    <div className="sect-b" style={{ marginBottom: 16 }}>
      <SelectRow icon="chartLine" title={t('Progression')} sheetTitle={t('Progression')}
        value={r.prog || 'linear'} onChange={v => update(s => { s.routines.find(x => x.id === id).prog = v })}
        options={POLICIES_FOR.reps.map(p => ({ value: p, label: t(POLICY_NAME[p]), subtitle: t(POLICY_DESC[p]) }))} />
    </div>
    <div className="small dim" style={{ margin: '-10px 2px 16px' }}>
      {t('Applies to every exercise in this routine that does not set its own rule.')}
    </div>

    {r.ex.length ? <div className="list">{r.ex.map((e, i) => {
      // An unresolvable id is shown rather than skipped — hiding it left an entry you
      // could neither see nor delete, but that still turned up in the workout.
      const ex = exOr(e.id)
      const linkedPrev = i > 0 && e.sg && r.ex[i - 1].sg === e.sg
      return <div key={i}>
        {unitFirst.has(i) && <div className="ss-label"><Icon name="link" />{t('Superset')}</div>}
        <div className={'item' + (inSS.has(i) ? ' in-ss' : '')} onClick={() => {
          exConfigSheet(ex, e, cfg => edit(x => { x[i] = { id: x[i].id, sg: x[i].sg, mandatory: x[i].mandatory, optional: x[i].optional, substitutes: x[i].substitutes, ...cfg } }), e.mandatory ? null : () => edit(x => { x.splice(i, 1); cleanupSg(x) }), r)
        }}>
          <Thumb ex={ex} />
          <div className="grow"><div className="tt capitalize">{ex.n}</div><div className="ss">{exLine(e, S.unit)}</div>{e.mandatory && <span className="tag acc">Mandatory</span>}{e.optional && !e.mandatory && <span className="tag">Optional in short sessions</span>}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none', alignItems: 'center' }}>
            {i > 0 && <button className={'iconbtn' + (linkedPrev ? ' on-ss' : '')} title={t('Superset with exercise above')} style={{ width: 32, height: 28, borderRadius: 8, fontSize: 15 }} onClick={ev => { ev.stopPropagation(); toggleLink(i) }}><Icon name="link" /></button>}
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="iconbtn" aria-label="Move up" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); move(i, -1) }}><Icon name="chevronUp" /></button>
              <button className="iconbtn" aria-label="Move down" style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }} onClick={ev => { ev.stopPropagation(); move(i, 1) }}><Icon name="chevronDown" /></button>
            </div>
          </div>
        </div>
        <div className="row" style={{ padding: '8px 12px', gap: 12, flexWrap: 'wrap' }}>
          <label className="small"><input type="checkbox" checked={!!e.mandatory} onChange={ev => { const checked = ev.target.checked; if (!checked && !window.confirm('Remove mandatory protection? This permits future removal or substitution.')) return; edit(x => { x[i].mandatory = checked; if (checked) x[i].optional = false }) }} /> Mandatory base exercise</label>
          <label className="small"><input type="checkbox" disabled={!!e.mandatory} checked={!!e.optional && !e.mandatory} onChange={ev => edit(x => { x[i].optional = ev.target.checked })} /> Optional in short sessions</label>
        </div>
        {!e.mandatory && <details style={{ padding: '0 12px 10px' }}><summary className="small">Approved alternatives ({e.substitutes?.length || 0})</summary>
          <p className="small dim">These may be selected for one session when equipment is unavailable. They never replace the routine automatically or copy weight.</p>
          {(e.substitutes || []).map(id => <div className="row between" key={id}><span className="small capitalize">{exOr(id).n} · {exOr(id).eq || 'equipment unspecified'}</span><button className="btn sm" onClick={() => edit(x => { x[i].substitutes = (x[i].substitutes || []).filter(v => v !== id) })}>Remove</button></div>)}
          <Button size="sm" disabled={(e.substitutes?.length || 0) >= 5} onClick={() => exercisePicker(chosen => edit(x => { if (chosen.id !== e.id && !(x[i].substitutes || []).includes(chosen.id)) x[i].substitutes = [...(x[i].substitutes || []), chosen.id].slice(0, 5) }))}>Add approved alternative</Button>
        </details>}
      </div>
    })}</div> : <div className="empty"><div className="ico"><Icon name="dumbbell" /></div>{t('No exercises yet — add your first one.')}</div>}

    {/* Coverage of the routine as planned, so a gap shows up while you're building it
        rather than after a month of training around it. */}
    {r.ex.length > 0 && (() => {
      const load = loadOfRoutine(r)
      const { worked } = rankOf(load)
      return <div className="card" style={{ marginTop: 12 }}>
        <h2>{t('What this session hits')}</h2>
        <BodyMap load={load} body={S.body} />
        <div className="mchips">
          {worked.slice(0, 6).map(m => <span key={m} className="mchip">{t(MUSCLE_NAME[m])}</span>)}
        </div>
      </div>
    })()}

    <div className="small dim row" style={{ margin: '10px 2px', gap: 5 }}><Icon name="link" style={{ fontSize: 13 }} />{t('Tap the link button on an exercise to superset it with the one above — you’ll do them back-to-back.')}</div>
    <Button variant="primary" onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => edit(x => { x.push({ id: ex.id, ...cfg }) }), null, r))} icon="plus">{t('Add exercise')}</Button>
    <div style={{ height: 10 }} />
    {r.ex.some(e => e.mandatory) && <p className="small dim">Routine deletion is blocked while it contains mandatory exercises. Unprotect them explicitly only after reviewing the base program.</p>}
    <Button disabled={r.ex.some(e => e.mandatory)} variant="danger" onClick={() => confirmSheet({
      title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name), confirmText: t('Delete'), danger: true,
      onConfirm: () => {
        update(s => {
          s.routines = s.routines.filter(x => x.id !== id)
          Object.keys(s.week).forEach(k => {
            const next = routineIds(s.week[k]).filter(x => x !== id)
            if (next.length) s.week[k] = next
            else delete s.week[k]
          })
          Object.keys(s.dayPlan).forEach(k => {
            const next = routineIds(s.dayPlan[k]).filter(x => x !== id)
            s.dayPlan[k] = next.length ? next : 'rest'
          })
        })
        nav('/plan')
      }
    })}>{t('Delete routine')}</Button>
  </div>
}
