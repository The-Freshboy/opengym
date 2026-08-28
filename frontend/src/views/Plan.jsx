import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, uid, exCount } from '../lib/format.js'
import { routineIds } from '../lib/history.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, scheduledDayActionsSheet, loadStarterPlan, planToolsSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { coachAvailable } from '../lib/coach.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { moveWeeklyRoutine } from '../lib/activities.js'

export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const update = useStore(s => s.update)
  const coachOn = coachAvailable(config, user, { demo: DEMO, mobile: MOBILE })
  const [dragging, setDragging] = useState(null)
  const [routineDrag, setRoutineDrag] = useState(null)

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  return <>
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      {coachOn && <button className="iconbtn" onClick={() => nav('/coach')} aria-label={t('Coach')} title={t('Coach')}><Icon name="sparkles" /></button>}
      <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>
    <div className="cols"><div>
      <h4 className="sec">{t('Week schedule')}</h4>
      <div className="small dim" style={{ margin: '-5px 2px 8px' }}>{t('Drag a routine to another day, or tap it for Move options.')}</div>
      <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {[1, 2, 3, 4, 5, 6, 0].map(d => {
          const routines = routineIds(S.week[d]).map(id => S.routines.find(x => x.id === id)).filter(Boolean)
          return <div key={d} className="item" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragging) update(s => { moveWeeklyRoutine(s, dragging.day, d, dragging.id) }); setDragging(null) }} onClick={() => routines.length === 1 ? scheduledDayActionsSheet(d, routines[0].id) : dayAssignSheet(d)}>
            <div className="grow"><div className="tt">{t(DAYN[d])}</div></div>
            {routines.length ? <div className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{routines.map(r => <span key={r.id} draggable className="tag acc" onDragStart={e => { e.stopPropagation(); setDragging({ day: d, id: r.id }) }} onDragEnd={() => setDragging(null)}><Icon name={glyphOf(r.emoji)} />{r.name}</span>)}</div> : <span className="tag">{t('Rest')}</span>}
            <Icon name="chevronRight" className="chev" /></div>
        })}
      </div>
    </div><div>
      <div className="row between" style={{ marginTop: 22, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
      </div>
      {S.routines.length ? <div className="list">{S.routines.map((r, idx) => <div key={r.id} className="item" draggable onDragStart={() => setRoutineDrag(idx)} onDragEnd={() => setRoutineDrag(null)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (routineDrag == null || routineDrag === idx) return; update(s => { const [moved] = s.routines.splice(routineDrag, 1); s.routines.splice(idx, 0, moved) }); setRoutineDrag(null) }} onClick={() => nav('/plan/r/' + r.id)}>
        <span className="dim" title={t('Drag to reorder')}><Icon name="list" /></span>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <Icon name="chevronRight" className="chev" /></div>)}</div> : <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (Push / Pull / Legs)')}</Button>
      </>}
    </div></div>
  </>
}
