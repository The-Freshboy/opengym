import fs from 'node:fs';
import path from 'node:path';

const REQUIRED = ['id', 'n', 'bp', 'eq', 'tg'];

export function validateExercises(value) {
  const list = Array.isArray(value) ? value : value?.exercises;
  if (!Array.isArray(list)) return { ok: false, errors: ['JSON must be an array, or an object with an exercises array.'] };
  if (!list.length) return { ok: false, errors: ['The exercise list is empty.'] };
  if (list.length > 10000) return { ok: false, errors: ['The exercise list exceeds the 10,000 item limit.'] };
  const ids = new Set(); const errors = [];
  const clean = list.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`Item ${i + 1} must be an object.`); return null; }
    const ex = { ...raw };
    for (const key of REQUIRED) {
      ex[key] = String(ex[key] ?? '').trim();
      if (!ex[key]) errors.push(`Item ${i + 1} is missing ${key}.`);
    }
    if (ex.id && ids.has(ex.id)) errors.push(`Duplicate exercise id: ${ex.id}.`);
    ids.add(ex.id);
    for (const key of ['sm', 'st']) {
      if (ex[key] == null) ex[key] = [];
      if (!Array.isArray(ex[key]) || ex[key].some(x => typeof x !== 'string')) errors.push(`${ex.id || `Item ${i + 1}`} has an invalid ${key} list.`);
    }
    for (const key of ['img', 'gif', 'mg']) if (ex[key] != null) ex[key] = String(ex[key]).trim();
    return ex;
  }).filter(Boolean);
  return errors.length ? { ok: false, errors: errors.slice(0, 50) } : { ok: true, exercises: clean };
}

export function createExerciseStore(dataDir, atomicWrite) {
  const currentFile = path.join(dataDir, 'exercises.json');
  const backupFile = path.join(dataDir, 'exercises.backup.json');
  const metaFile = path.join(dataDir, 'exercises.meta.json');
  const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const current = () => {
    const checked = validateExercises(read(currentFile));
    return checked.ok ? checked.exercises : null;
  };
  const meta = () => read(metaFile) || {};
  return {
    current,
    status() {
      const list = current(), m = meta();
      return { active: !!list, count: list?.length || 0, updatedAt: m.updatedAt || null, backupAvailable: fs.existsSync(backupFile) };
    },
    apply(value, adminId) {
      const checked = validateExercises(value);
      if (!checked.ok) return checked;
      atomicWrite(backupFile, JSON.stringify(current()));
      atomicWrite(currentFile, JSON.stringify(checked.exercises));
      atomicWrite(metaFile, JSON.stringify({ updatedAt: new Date().toISOString(), updatedBy: adminId }));
      return { ok: true, count: checked.exercises.length };
    },
    rollback(adminId) {
      if (!fs.existsSync(backupFile)) return { ok: false, errors: ['No backup is available.'] };
      const previous = read(backupFile);
      if (previous === null) { try { fs.unlinkSync(currentFile); } catch {} }
      else {
        const checked = validateExercises(previous);
        if (!checked.ok) return { ok: false, errors: ['The backup is invalid.'] };
        atomicWrite(currentFile, JSON.stringify(checked.exercises));
      }
      fs.unlinkSync(backupFile);
      atomicWrite(metaFile, JSON.stringify({ updatedAt: new Date().toISOString(), updatedBy: adminId, rolledBack: true }));
      return { ok: true, count: previous?.length || 0, bundled: previous === null };
    }
  };
}
