const DAY_MS = 86400000
const WEEK_MS = 7 * DAY_MS

const validISO = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const dateMs = value => Date.parse(String(value) + 'T12:00:00Z')
const iso = ms => new Date(ms).toISOString().slice(0, 10)
const round = n => Math.round(n * 10) / 10

function plannedOn(plan, date) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay()
  const value = plan?.week?.[weekday]
  if (value == null || value === 'rest') return false
  if (Array.isArray(value)) return value.some(Boolean)
  return !!value
}

export function explainedMissedDates(payload) {
  const from = payload?.window?.from
  const to = payload?.window?.to
  if (!validISO(from) || !validISO(to) || from > to) return []
  const completed = new Set((payload.window?.workouts || []).map(w => w?.d).filter(validISO))
  const dates = new Set()
  for (const c of payload.userContext || []) {
    if (!c?.affectsAdherence || !validISO(c.from) || !validISO(c.to)) continue
    const start = Math.max(dateMs(from), dateMs(c.from))
    const end = Math.min(dateMs(to), dateMs(c.to))
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) continue
    for (let t = start; t <= end; t += DAY_MS) {
      const d = iso(t)
      if (plannedOn(payload.plan, d) && !completed.has(d)) dates.add(d)
    }
  }
  return [...dates].sort()
}

export function adherenceContext(payload) {
  const from = payload?.window?.from
  const to = payload?.window?.to
  const plannedPerWeek = Object.entries(payload?.plan?.week || {}).filter(([, value]) => value != null && value !== 'rest' && (!Array.isArray(value) || value.some(Boolean))).length
  const sessions = payload?.window?.workouts?.length || 0
  if (!plannedPerWeek || !validISO(from) || !validISO(to)) return null
  const weeks = Math.max(1, Math.ceil((dateMs(to) - dateMs(from)) / WEEK_MS))
  const expected = plannedPerWeek * weeks
  const explainedDates = explainedMissedDates(payload)
  const adjustedExpected = Math.max(sessions, expected - explainedDates.length)
  return {
    sessions,
    expected,
    observedRate: expected > 0 ? Math.min(1, sessions / expected) : 1,
    adjustedExpected,
    adjustedRate: adjustedExpected > 0 ? Math.min(1, sessions / adjustedExpected) : 1,
    explainedDates
  }
}

export function applyCoachContextToScience(science, payload) {
  const result = JSON.parse(JSON.stringify(science || {}))
  const adherence = adherenceContext(payload)
  if (!adherence || !adherence.explainedDates.length) return result

  result.measurements ||= {}
  result.measurements.adherence = {
    sessions: adherence.sessions,
    expected: adherence.expected,
    observedRate: round(adherence.observedRate),
    explainedMissedSessions: adherence.explainedDates.length,
    adjustedExpected: adherence.adjustedExpected,
    adjustedRate: round(adherence.adjustedRate)
  }

  result.limitations = Array.isArray(result.limitations) ? result.limitations : []
  result.limitations.push('Adjusted adherence excludes only user-recorded, date-bounded contexts marked as affecting adherence; it does not infer reasons for missing sessions.')
  result.findings = Array.isArray(result.findings) ? result.findings : []
  const lowIndex = result.findings.findIndex(f => f?.id === 'adherence-low')

  if (adherence.observedRate < 0.7 && adherence.adjustedRate >= 0.7) {
    if (lowIndex >= 0) result.findings.splice(lowIndex, 1)
    result.findings.push({
      id: 'adherence-explained', category: 'adherence', severity: 'info', confidence: 'high',
      metric: {
        sessions: adherence.sessions,
        expected: adherence.expected,
        observedRate: round(adherence.observedRate),
        explainedMissedSessions: adherence.explainedDates.length,
        adjustedExpected: adherence.adjustedExpected,
        adjustedRate: round(adherence.adjustedRate)
      },
      reading: `${adherence.sessions} sessions were completed against roughly ${adherence.expected} originally planned, but ${adherence.explainedDates.length} missed planned session${adherence.explainedDates.length === 1 ? '' : 's'} fall inside user-recorded explained-absence dates. Adjusted adherence is about ${Math.round(adherence.adjustedRate * 100)}%, so the raw rate should not by itself be used as evidence that the weekly schedule is a poor fit.`,
      sourceIds: []
    })
  } else if (lowIndex >= 0) {
    const finding = result.findings[lowIndex]
    finding.metric = {
      ...(finding.metric || {}),
      observedExpected: adherence.expected,
      observedRate: round(adherence.observedRate),
      explainedMissedSessions: adherence.explainedDates.length,
      adjustedExpected: adherence.adjustedExpected,
      adjustedRate: round(adherence.adjustedRate)
    }
    finding.reading = `${adherence.sessions} sessions were completed against roughly ${adherence.expected} originally planned. ${adherence.explainedDates.length} missed planned session${adherence.explainedDates.length === 1 ? '' : 's'} fall inside user-recorded explained-absence dates, leaving roughly ${adherence.adjustedExpected} adjusted planned sessions and about ${Math.round(adherence.adjustedRate * 100)}% adjusted adherence.`
  }
  return result
}
