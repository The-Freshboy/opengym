import test from 'node:test';
import assert from 'node:assert/strict';
import { scientificReview } from '../coach/science.js';

const payload = over => ({
  plan: { routines: [{ id: 'push', ex: [{ id: '0025', mode: 'reps', sets: 10 }] }], week: { 1: 'push', 4: 'push' } },
  window: { workouts: [] }, aggregates: { exercises: [] }, ...over
});

test('scientific review measures scheduled weekly volume and cites versioned evidence', () => {
  const r = scientificReview(payload(), new Date('2026-08-28T00:00:00Z'));
  assert.equal(r.schema, 1);
  assert.equal(r.evidenceVersion, '2026-08-28');
  assert.equal(r.measurements.plannedByMuscle.pectorals.weeklySets, 20);
  const high = r.findings.find(f => f.category === 'volume');
  assert.equal(high.metric.weeklySets, 20);
  assert.ok(high.sourceIds.includes('schoenfeld-2017-volume'));
  assert.ok(r.sources.every(s => s.url.startsWith('https://')));
});

test('effort flag is based only on completed sets with logged RIR or RPE', () => {
  const sets = Array.from({ length: 8 }, (_, i) => ({ done: true, ...(i < 6 ? { rir: 1 } : { rir: 3 }) }));
  const r = scientificReview(payload({ window: { workouts: [{ d: '2026-08-27', entries: [{ id: '0025', sets }] }] } }), new Date('2026-08-28T00:00:00Z'));
  const f = r.findings.find(x => x.category === 'effort');
  assert.deepEqual(f.metric, { hardSets: 6, effortSets: 8, proportion: 0.8 });
});

test('repeated target misses are high-confidence measured signals', () => {
  const r = scientificReview(payload({ aggregates: { exercises: [{ id: '0025', name: 'bench press', stalls: 2 }] } }), new Date('2026-08-28T00:00:00Z'));
  const f = r.findings.find(x => x.id === 'repeated-target-misses');
  assert.equal(f.confidence, 'high');
  assert.equal(f.metric.exercises[0].stalls, 2);
});

test('limited history lowers confidence and states the limitation', () => {
  const r = scientificReview(payload({ plan: { routines: [], week: {} } }), new Date('2026-08-28T00:00:00Z'));
  assert.equal(r.confidence, 'low');
  assert.match(r.findings[0].reading, /too little/i);
  assert.ok(r.limitations.some(x => x.includes('Population-level')));
});
