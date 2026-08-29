import { createRequire } from 'node:module';
import { LIBRARY } from './payload.js';

const require_ = createRequire(import.meta.url);
const EVIDENCE = require_('./evidence.json');
const BY_ID = new Map(LIBRARY.map(e => [e.id, e]));
const muscleOf = e => { const x = BY_ID.get(e?.id); return x?.tg || x?.bp || null; };
const round = n => Math.round(n * 10) / 10;

function plannedDose(plan) {
  const routines = new Map((plan?.routines || []).map(r => [r.id, r]));
  const out = {};
  const scheduled = Object.values(plan?.week || {}).flatMap(v => [...new Set(Array.isArray(v) ? v : [v])]);
  for (const rid of scheduled) {
    const r = routines.get(rid);
    for (const e of r?.ex || []) {
      if (e.mode === 'cardio') continue;
      const muscle = muscleOf(e); if (!muscle) continue;
      const m = (out[muscle] ||= { weeklySets: 0, sessions: 0 });
      m.weeklySets += Number(e.sets) || 0;
    }
    for (const muscle of new Set((r?.ex || []).map(muscleOf).filter(Boolean))) out[muscle].sessions++;
  }
  return out;
}

function completedDose(workouts) {
  const out = {};
  for (const w of workouts || []) for (const e of w.entries || []) {
    const muscle = muscleOf(e); if (!muscle) continue;
    const sets = (e.sets || []).filter(s => s.done); if (!sets.length) continue;
    const m = (out[muscle] ||= { sets: 0, sessions: 0, hardSets: 0, effortSets: 0 });
    m.sets += sets.length; m.sessions++;
    for (const s of sets) {
      if (s.rir != null || s.rpe != null) m.effortSets++;
      if ((s.rir != null && s.rir <= 1) || (s.rpe != null && s.rpe >= 9)) m.hardSets++;
    }
  }
  return out;
}

export function scientificReview(payload, now = new Date()) {
  const planned = plannedDose(payload.plan);
  const completed = completedDose(payload.window?.workouts);
  const sessions = payload.window?.workouts?.length || 0;
  const exercises = (payload.plan?.routines || []).flatMap(r => r.ex || []);
  const metadataCoverage = exercises.length ? exercises.filter(muscleOf).length / exercises.length : 0;
  const findings = [];
  for (const [muscle, d] of Object.entries(planned).sort((a, b) => b[1].weeklySets - a[1].weeklySets)) {
    if (d.weeklySets >= 20) findings.push({ id: `volume-high-${muscle}`, category: 'volume', severity: 'watch', confidence: metadataCoverage >= .9 ? 'medium' : 'low', metric: { muscle, ...d }, reading: `${muscle}: ${d.weeklySets} planned working sets per week across ${d.sessions} session${d.sessions === 1 ? '' : 's'}. This is a high-workload flag, not proof that it is excessive.`, sourceIds: ['acsm-2026', 'schoenfeld-2017-volume'] });
    if (d.weeklySets >= 8 && d.sessions === 1) findings.push({ id: `frequency-${muscle}`, category: 'frequency', severity: 'info', confidence: 'low', metric: { muscle, ...d }, reading: `${muscle}: all ${d.weeklySets} planned weekly sets are concentrated in one session. Splitting them may improve practicality, but frequency alone is not an outcome guarantee.`, sourceIds: ['acsm-2026'] });
  }
  let effortSets = 0, hardSets = 0;
  for (const d of Object.values(completed)) { effortSets += d.effortSets; hardSets += d.hardSets; }
  if (effortSets >= 6 && hardSets / effortSets >= .75) findings.push({ id: 'effort-mostly-near-failure', category: 'effort', severity: 'watch', confidence: 'medium', metric: { hardSets, effortSets, proportion: round(hardSets / effortSets) }, reading: `${hardSets} of ${effortSets} rated sets were logged at 0–1 RIR or RPE 9–10. Failure is not consistently required for results, so recovery and target completion deserve attention.`, sourceIds: ['acsm-2026', 'refalo-2023-failure'] });
  const stalls = (payload.aggregates?.exercises || []).filter(e => e.stalls >= 2);
  if (stalls.length) findings.push({ id: 'repeated-target-misses', category: 'progression', severity: 'action', confidence: 'high', metric: { exercises: stalls.map(e => ({ id: e.id, name: e.name, stalls: e.stalls })) }, reading: `${stalls.length} exercise${stalls.length === 1 ? ' has' : 's have'} missed the prescribed target in at least two consecutive sessions.`, sourceIds: ['moesgaard-2022-periodisation'] });
  if (!findings.length) findings.push({ id: 'no-clear-signal', category: 'data-quality', severity: 'info', confidence: sessions >= 4 ? 'medium' : 'low', metric: { sessions }, reading: sessions < 4 ? `Only ${sessions} completed session${sessions === 1 ? '' : 's'} are available; that is too little for strong trend claims.` : 'No high-confidence workload, effort, or progression flag was detected.', sourceIds: ['acsm-2026'] });
  return { schema: 1, generatedAt: now.toISOString(), evidenceVersion: EVIDENCE.version, confidence: metadataCoverage >= .9 && sessions >= 4 ? 'medium' : 'low', limitations: ['Set counts use primary exercise metadata and do not assign fractional credit to secondary muscles.', 'Population-level research cannot determine an individual optimum or assess pain, injury, technique, sleep, or nutrition.', ...(metadataCoverage < 1 ? [`Exercise metadata coverage is ${Math.round(metadataCoverage * 100)}%.`] : [])], measurements: { plannedByMuscle: planned, completedByMuscle: completed, sessions, metadataCoverage: round(metadataCoverage) }, findings, sources: EVIDENCE.sources };
}
