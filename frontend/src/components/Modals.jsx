import { useEffect } from 'react'
import { useUI } from '../store/useUI.js'
import Icon from './Icon.jsx'

// One bottom sheet (or centered dialog). A visible close button is deliberately used instead
// of drag-down-to-dismiss: on touch screens that gesture competes with scrolling long forms
// and can close a sheet while someone is only trying to reach its lower controls.
function Sheet({ sheet }) {
  const { closeSheet } = useUI()
  const close = () => closeSheet(sheet.id)
  const closeButton = !sheet.locked && <button className="sheet-close" onClick={close} aria-label="Close"><Icon name="xmark" /></button>
  if (sheet.kind === 'center') {
    return (
      <div>
        <div className="mback" onClick={() => { if (!sheet.locked) close() }} />
        <div className="center">{closeButton}{sheet.render(close)}</div>
      </div>
    )
  }
  return (
    <div>
      <div className="mback" onClick={() => { if (!sheet.locked) close() }} />
      <div className="sheet">
        {closeButton}
        {sheet.render(close)}
      </div>
    </div>
  )
}

export default function Modals() {
  const sheets = useUI(s => s.sheets)

  // lock the page behind any open sheet (iOS-safe)
  useEffect(() => {
    if (!sheets.length) return
    const y = window.scrollY || 0
    const b = document.body.style
    b.position = 'fixed'; b.top = -y + 'px'; b.left = '0'; b.right = '0'; b.width = '100%'
    return () => {
      b.position = b.top = b.left = b.right = b.width = ''
      window.scrollTo(0, y)
    }
  }, [sheets.length > 0])

  if (!sheets.length) return null
  return (
    <div id="modal-root" className="open">
      {sheets.map(s => <Sheet key={s.id} sheet={s} />)}
    </div>
  )
}
