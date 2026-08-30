import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXDB } from '../lib/exercises-data.js'
import { todayISO, isoOf } from '../lib/format.js'
import { MOBILE } from '../lib/mobile.js'
import { preparePhysioReport, reportOptionsError, createPhysioPdf } from '../lib/physio-report.js'
import { Button } from '../components/ui.jsx'

export default function PhysioReport() {
  const S = useStore(s => s.S), nav = useNavigate()
  const [options, setOptions] = useState(() => { const from = new Date(); from.setDate(from.getDate() - 27); return { from: isoOf(from), to: todayISO(), notes: false, feedback: false, tests: true, plan: false } })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ready, setReady] = useState(null)
  const invalid = reportOptionsError(options)
  const report = useMemo(() => invalid ? null : preparePhysioReport(S, options, EXDB), [S, options, invalid])
  const change = patch => { setOptions(o => ({ ...o, ...patch })); setReady(null); setError('') }
  const generate = async () => {
    setBusy(true); setReady(null); setError('')
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/DejaVuSans.ttf`)
      if (!response.ok) throw new Error('Could not load the report font. Please retry online.')
      const bytes = new Uint8Array(await response.arrayBuffer())
      let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      const pdf = await createPhysioPdf(report, btoa(binary))
      setReady({ blob: pdf.output('blob'), filename: `opengym-physio-${options.from}-to-${options.to}.pdf` })
    } catch (e) { setError(e.message || 'Could not generate the report. Your training data is unchanged.') }
    finally { setBusy(false) }
  }
  const save = async (share = false) => {
    setError('')
    try {
      if (MOBILE) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem'), { Share } = await import('@capacitor/share')
        const bytes = new Uint8Array(await ready.blob.arrayBuffer()); let binary = ''
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
        const written = await Filesystem.writeFile({ path: ready.filename, directory: Directory.Cache, data: btoa(binary) })
        await Share.share({ title: 'Training report', url: written.uri })
      } else if (share) {
        await navigator.share({ files: [new File([ready.blob], ready.filename, { type: 'application/pdf' })], title: 'Training report' })
      } else {
        const url = URL.createObjectURL(ready.blob), link = document.createElement('a')
        link.href = url; link.download = ready.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
    } catch (e) { if (e.name !== 'AbortError') setError('Sharing was unavailable. Try Download PDF or save to Files.') }
  }
  const canShare = ready && !MOBILE && navigator.canShare?.({ files: [new File([ready.blob], ready.filename, { type: 'application/pdf' })] })
  return <div className="narrow personal-page"><div className="hdr"><div><h1>Physio report</h1><p className="sub">Export your workouts to PDF</p></div><Button size="sm" onClick={() => nav('/personal')}>Back</Button></div>
    <section className="card"><h2>Choose what to share</h2><p className="small dim">Created on your device. No upload to an AI service and no API charge. The PDF contains private information; share it only with your intended recipient.</p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <label>From<input className="field" type="date" value={options.from} onChange={e => change({ from: e.target.value })} /></label>
        <label>To<input className="field" type="date" value={options.to} onChange={e => change({ to: e.target.value })} /></label>
        {[['notes', 'Include session and exercise notes'], ['feedback', 'Include joint discomfort, energy and session difficulty'], ['tests', 'Include logged test results'], ['plan', 'Append my current plan (clearly marked as planned, not completed)']].map(([key, label]) => <label key={key} className="personal-check"><input type="checkbox" checked={options[key]} onChange={e => change({ [key]: e.target.checked })} />{label}</label>)}
      </fieldset>
      <p className="small dim">Completed sets, loads, reps, hold times, cardio and recorded RIR/RPE are included. Account information, body weight and medication intake are excluded. Free-text notes may contain sensitive information if you choose to include them.</p>
      {invalid && <p role="alert">{invalid}</p>}
      {report && <><h3>Report preview</h3><p>{report.sessions.length} logged sessions / activities · {report.results.length} test results{options.plan ? ` · ${report.routines.length} current routines` : ''}</p><details><summary>Sessions included</summary>{report.sessions.map((w, i) => <p key={i} className="small">{w.date} · {w.name} · {w.status}</p>)}</details></>}
      <Button variant="primary" disabled={busy || !!invalid} onClick={generate}>{busy ? 'Preparing PDF…' : 'Prepare PDF'}</Button>
      {ready && <div className="personal-actions" style={{ marginTop: 12 }}><p className="small">Report ready. This is a snapshot of your data when you pressed Prepare PDF.</p><Button onClick={() => save()}>{MOBILE ? 'Save / share PDF' : 'Download PDF'}</Button>{canShare && <Button onClick={() => save(true)}>Share PDF</Button>}</div>}
      {error && <p role="alert">{error}</p>}
    </section>
  </div>
}
