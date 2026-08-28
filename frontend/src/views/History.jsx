import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { WorkoutRow, workoutDetailSheet, calendarSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { filterHistory } from '../lib/history-search.js'

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const shown = filterHistory(S.workouts, query, kind)
  const incomplete = S.workouts.filter(w => w.incomplete).length
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 12 }}><h1>{t('History')}</h1><div className="sub">{t('{0} sessions', S.workouts.length)}</div></div>
      <button className="iconbtn" onClick={() => calendarSheet()} aria-label={t('Calendar')}><Icon name="calendar" /></button></div>
    {S.workouts.length ? <>
      <div className="search"><Icon name="magnifier" /><input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search history…')} aria-label={t('Search history')} /></div>
      <div className="chips" style={{ margin: '10px 0 12px' }}>
        {[['all', 'All'], ['workouts', 'Workouts'], ['activities', 'Activities'], ['incomplete', incomplete ? `Incomplete ${incomplete}` : 'Incomplete']].map(([id, label]) => <button key={id} className={'chip' + (kind === id ? ' on' : '')} onClick={() => setKind(id)}>{t(label)}</button>)}
      </div>
      {shown.length ? <div className="list">{shown.map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
        : <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No matching sessions.')}</div>}
    </> : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet.')}</div>}
  </>
}
