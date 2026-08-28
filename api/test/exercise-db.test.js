import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tempData } from './helpers.mjs';

const dir = tempData();
const { createExerciseStore, validateExercises } = await import('../exercise-db.js');
const atomic = (file, content) => { fs.writeFileSync(file + '.tmp', content); fs.renameSync(file + '.tmp', file); };
const ex = (id, n = 'Plank') => ({ id, n, bp: 'waist', eq: 'body weight', tg: 'abs', sm: [], st: ['Hold.'] });

test('validates required fields and duplicate ids', () => {
  assert.equal(validateExercises([ex('1')]).ok, true);
  assert.match(validateExercises([ex('1'), ex('1')]).errors.join(' '), /Duplicate/);
  assert.match(validateExercises([{ id: '1' }]).errors.join(' '), /missing n/);
});

test('apply persists a catalogue and rollback restores the previous version', () => {
  const store = createExerciseStore(dir, atomic);
  assert.deepEqual(store.status(), { active: false, count: 0, updatedAt: null, backupAvailable: false });
  assert.equal(store.apply([ex('1')], 'admin').ok, true);
  assert.equal(store.current()[0].n, 'Plank');
  assert.equal(store.apply([ex('1', 'Side plank'), ex('2')], 'admin').ok, true);
  assert.equal(store.current().length, 2);
  assert.equal(store.rollback('admin').ok, true);
  assert.equal(store.current()[0].n, 'Plank');
});

test('the first import can roll back to the bundled catalogue', () => {
  const fresh = tempData(); const store = createExerciseStore(fresh, atomic);
  store.apply([ex('1')], 'admin');
  const result = store.rollback('admin');
  assert.equal(result.bundled, true);
  assert.equal(store.current(), null);
});

test('Coach resolves ids and names from the active uploaded catalogue', async () => {
  const store = createExerciseStore(dir, atomic);
  store.apply([ex('runtime-plank', 'Runtime plank')], 'admin');
  process.env.DATA_DIR = dir;
  const { libraryHas, libraryName } = await import('../coach/payload.js');
  assert.equal(libraryHas('runtime-plank'), true);
  assert.equal(libraryName('runtime-plank'), 'Runtime plank');
});
