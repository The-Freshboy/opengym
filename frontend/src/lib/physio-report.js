// Explicit allowlist: never export account credentials, Coach intake, or medications.
// Pure data preparation also lets tests verify privacy before any PDF is generated.
import { hangContextLabel, repCountLabel } from './training-log.js'
const value = n => Number.isFinite(n) ? String(n) : 'not logged'
const clean = text => String(text ?? '').replace(/[\u2010-\u2015]/g, '-').replace(/\r\n/g, '\n')
const dateOK = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d

export function reportOptionsError(o) {
  if (!dateOK(o.from) || !dateOK(o.to)) return 'Choose a valid start and end date.'
  if (o.from > o.to) return 'The start date must be on or before the end date.'
  return ''
}

function prescription(t = {}, unit) {
  t ||= {}
  const load = Number.isFinite(t.weight) ? `${t.weight} ${unit}` : 'load not specified'
  if (t.mode === 'cardio' || t.min != null) return `${value(t.sets)} set(s); ${value(t.min)} min; speed ${value(t.speed)} km/h`
  if (t.mode === 'time') return `${value(t.sets)} set(s); ${value(t.sec)} s; ${load}`
  return `${value(t.sets)} set(s); ${repCountLabel(t.reps ?? 'not logged', t.repsConvention)} reps; ${load}`
}
function actual(s, t, unit) {
  if (t?.mode === 'cardio' || s.min != null) return `${value(s.min)} min; speed ${value(s.speed)} km/h`
  if (t?.mode === 'time' || s.sec != null) return `${value(s.sec)} s; load ${value(s.w)} ${unit}`
  return `${repCountLabel(s.r ?? 'not logged', t?.repsConvention)} reps; load ${value(s.w)} ${unit}`
}

export function preparePhysioReport(S, options, catalogue = []) {
  const error = reportOptionsError(options); if (error) throw new Error(error)
  const { from, to, notes = false, feedback = false, plan = false, tests = true } = options
  const names = new Map([...catalogue, ...(S.customEx || [])].map(x => [x.id, x.n || x.name || x.id]))
  const name = e => clean(e.name || names.get(e.id) || e.id || 'Unknown exercise')
  const inRange = x => x.d >= from && x.d <= to
  const sessions = (S.workouts || []).filter(inRange).slice().sort((a, b) => a.d.localeCompare(b.d)).map(w => {
    const unit = ['kg', 'lb'].includes(w.unit) ? w.unit : `${S.unit || 'kg'} (assumed)*`
    const rows = (w.entries || []).flatMap(e => {
      const completed = (e.sets || []).map((s, i) => ({ ...s, number: i + 1 })).filter(s => s.done)
      const output = completed.map((s, i) => [i === 0 ? name(e) : '', String(s.number) + (s.type === 'warmup' ? ' W' : ''), actual(s, e.target, unit), [Number.isFinite(s.rir) ? `RIR ${s.rir}` : '', Number.isFinite(s.rpe) ? `RPE ${s.rpe}` : ''].filter(Boolean).join('; ') || 'Not logged', i === 0 ? prescription(e.target, unit) : ''])
      if (!completed.length) output.push([name(e), '-', 'No completed sets logged', '-', prescription(e.target, unit)])
      if (notes && e.note) output.push([{ content: `Exercise note: ${clean(e.note)}`, colSpan: 5 }])
      if (notes && hangContextLabel(e.hangContext)) output.push([{ content: `Hold context: ${clean(hangContextLabel(e.hangContext))}`, colSpan: 5 }])
      return output
    })
    const details = []
    if (w.copiedHistory) details.push('Copied completed-history record, confirmed by user; excluded from progression evidence.')
    if (w.trainingContext?.equipmentProfile?.name) details.push(`Equipment profile: ${clean(w.trainingContext.equipmentProfile.name)} (recorded with this session)`)
    if (w.kind === 'activity') {
      details.push(`Activity: ${clean(w.activityType || w.name)}; duration ${value(w.durationMin)} min; intensity ${value(w.intensity)}/10`)
      if (w.distance) details.push(`Distance: ${clean(w.distance)} km`)
      if (w.style || w.grade) details.push(`Style: ${clean(w.style) || 'not logged'}; grade: ${clean(w.grade) || 'not logged'}`)
      if (Number.isFinite(w.attempts)) details.push(`Attempts ${w.attempts}; sends ${value(w.sends)}; flashes ${value(w.flashes)}`)
    }
    if (feedback) {
      if (w.rating) details.push(`Session difficulty: ${clean(w.rating)}`)
      if (Number.isFinite(w.feedback?.energy)) details.push(`Energy: ${w.feedback.energy}/5`)
      if (typeof w.feedback?.jointDiscomfort === 'boolean') details.push(`Joint discomfort reported: ${w.feedback.jointDiscomfort ? 'yes' : 'no'}`)
      for (const key of ['tingling', 'numbness', 'weakness']) if (typeof w.feedback?.[key] === 'boolean') details.push(`${key}: ${w.feedback[key] ? 'yes' : 'no'}`)
      if (w.feedback?.symptomLocation) details.push(`Symptom location: ${clean(w.feedback.symptomLocation)}`)
      if (w.feedback?.symptomTiming) details.push(`Symptom timing: ${clean(w.feedback.symptomTiming)}`)
      if (Number.isFinite(w.sessionRpe)) details.push(`Session effort: ${w.sessionRpe}/10`)
    }
    if (notes && w.note) details.push(`Session note: ${clean(w.note)}`)
    return { date: w.d, name: clean(w.name || 'Workout'), status: w.kind === 'activity' ? 'Logged activity' : `${w.incomplete ? 'Marked incomplete' : 'Saved workout'}${w.variant === 'short' ? ' / short version' : ''}`, details, rows, assumedUnit: !w.unit && !!rows.length }
  })
  const goals = new Map((S.goals || []).map(g => [g.id, g]))
  const results = tests ? (S.goalResults || []).filter(inRange).slice().sort((a, b) => a.d.localeCompare(b.d)).map(r => {
    const g = goals.get(r.goalId) || {}
    const result = g.kind === 'beep' ? `Level ${value(r.value)}, shuttle ${value(r.shuttle)}` : `${value(r.value)} ${clean(g.unit || 'unit not recorded')}`
    return [r.d, clean(g.name || 'Test'), result, clean([g.protocol, g.kind === 'hang' ? `${r.grip || 'grip not logged'}; standard confirmed: ${r.standard ? 'yes' : 'no'}` : '', notes ? r.note : ''].filter(Boolean).join('\n'))]
  }) : []
  const routines = plan ? (S.routines || []).map(r => ({ name: clean(r.name), rows: (r.ex || []).map(e => [name(e), prescription(e, S.unit || 'kg'), e.mandatory ? 'Mandatory base' : e.optional ? 'Optional' : 'Included', ...(notes ? [clean(e.note || '')] : [])]) })) : []
  const programmeChanges = plan ? (S.programmeHistory || []).filter(v => v.at?.slice(0, 10) >= from && v.at.slice(0, 10) <= to).map(v => ({ at: clean(v.at), dates: (v.changedDates || []).filter(d => dateOK(d)) })) : []
  return { from, to, sessions, results, routines, programmeChanges, options: { notes, feedback, plan, tests }, assumedUnit: sessions.some(w => w.assumedUnit) }
}

export async function createPhysioPdf(report, fontBase64) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ format: 'a4', unit: 'mm', compress: true, putOnlyUsedFonts: true })
  if (!fontBase64) throw new Error('The report font could not be loaded. Please retry online.')
  doc.addFileToVFS('DejaVuSans.ttf', fontBase64)
  doc.addFont('DejaVuSans.ttf', 'Report', 'normal'); doc.setFont('Report')
  doc.setProperties({ title: 'OpenGYM - training report for physiotherapy', subject: `${report.from} to ${report.to}`, creator: 'OpenGYM' })
  let y = 19
  const text = (s, size = 10, colour = [42, 48, 53]) => {
    doc.setFontSize(size); doc.setTextColor(...colour)
    const lines = doc.splitTextToSize(clean(s), 178)
    for (const line of lines) { if (y > 276) { doc.addPage(); y = 19 } doc.text(line, 16, y); y += size * .48 }
    y += 3
  }
  const heading = s => { if (y > 220) { doc.addPage(); y = 19 } y += 3; text(s, 13, [16, 94, 105]) }
  const table = (head, body, columnStyles = {}) => {
    // Keep the column heading with at least one data row.
    if (y > 239) { doc.addPage(); y = 19 }
    autoTable(doc, { startY: y, head: [head], body, margin: { left: 16, right: 16, top: 18, bottom: 19 }, styles: { font: 'Report', fontStyle: 'normal', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', lineColor: [220, 225, 228] }, headStyles: { fillColor: [16, 94, 105], fontStyle: 'normal' }, alternateRowStyles: { fillColor: [244, 247, 248] }, columnStyles, rowPageBreak: 'avoid', showHead: 'everyPage' })
    y = doc.lastAutoTable.finalY + 7
  }
  text('OpenGYM | Physiotherapy report', 19)
  text(`${report.from} to ${report.to}`, 12)
  text(`${report.sessions.length} logged sessions / activities; ${report.results.length} test results.`, 10)
  text('Self-reported training log, not a clinical assessment. Only sets marked completed are reported as performed. Saved targets may be defaults and are not evidence of ability. Unlogged sessions and unchecked sets are not proof of missed training.', 9)
  text(`Privacy choices: notes ${report.options.notes ? 'included' : 'excluded'}; joint/energy feedback ${report.options.feedback ? 'included' : 'excluded'}; current plan ${report.options.plan ? 'included separately' : 'excluded'}; test results ${report.options.tests ? 'included' : 'excluded'}. Account details, medication intake and body weight are not exported.`, 9)
  if (report.assumedUnit) text('* Older sessions did not store a unit. Their loads use the current profile unit, labelled assumed; verify these against your records.', 9)
  text('Load is the entered equipment load, not total body weight; assistance conventions depend on the exercise. RIR = repetitions in reserve; RPE = recorded rating of perceived exertion. Speed is recorded in km/h. No beep-test score is inferred from treadmill running.', 9)
  text('W marks a warm-up set. Warm-ups are included in this performed-work log but excluded from working-set records and progression comparisons. Hold context is included only with notes; nerve-symptom feedback only with feedback sharing.', 9)
  heading('Completed work and logged activities')
  if (!report.sessions.length) text('No saved sessions in this date range. This does not mean no training occurred.')
  for (const w of report.sessions) {
    heading(`${w.date} | ${w.name}`); text(w.status, 9)
    for (const detail of w.details) text(detail, 9)
    if (w.rows.length) table(['Exercise', 'Set', 'Performed (logged)', 'Effort', 'Saved target (not performed)'], w.rows, { 0: { cellWidth: 39 }, 1: { cellWidth: 10 }, 2: { cellWidth: 49 }, 3: { cellWidth: 22 }, 4: { cellWidth: 58 } })
  }
  if (report.options.tests) { heading('Manually logged test results'); if (report.results.length) table(['Date', 'Test', 'Result', 'Protocol / conditions'], report.results); else text('No test results recorded in this date range.') }
  if (report.options.plan) {
    doc.addPage(); y = 19; heading('Current plan - NOT completed work')
    text('This is the current saved plan at export time, not a reconstruction of the plan used for past workouts. Planned loads are not tested capacity.', 9)
    text('Programme-change history is limited to retained snapshots, not a complete audit of older training.', 9)
    for (const change of report.programmeChanges || []) text(`Retained change: ${change.at}${change.dates.length ? '; affected dated overrides: ' + change.dates.join(', ') : '; routine or weekly-plan change'}`, 9)
    for (const r of report.routines) { heading(r.name); table(['Exercise', 'Current prescription', 'Role', ...(report.options.notes ? ['Plan note'] : [])], r.rows) }
  }
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(100); doc.text(`OpenGYM - private training report | ${report.from} to ${report.to}`, 16, 289); doc.text(`${p} / ${pages}`, 194, 289, { align: 'right' }) }
  return doc
}
