const comparable = ex => JSON.stringify(ex, Object.keys(ex).sort())

export function parseExerciseImport(text, current = []) {
  let value
  try { value = JSON.parse(text) } catch { return { ok: false, errors: ['The file is not valid JSON.'] } }
  const exercises = Array.isArray(value) ? value : value?.exercises
  if (!Array.isArray(exercises) || !exercises.length) return { ok: false, errors: ['Expected a non-empty array, or an object with an exercises array.'] }
  const errors = []; const seen = new Set()
  exercises.forEach((ex, i) => {
    if (!ex || typeof ex !== 'object') return errors.push(`Item ${i + 1} must be an object.`)
    for (const key of ['id', 'n', 'bp', 'eq', 'tg']) if (!String(ex[key] ?? '').trim()) errors.push(`Item ${i + 1} is missing ${key}.`)
    if (seen.has(String(ex.id))) errors.push(`Duplicate exercise id: ${ex.id}.`)
    seen.add(String(ex.id))
  })
  if (errors.length) return { ok: false, errors: errors.slice(0, 20) }
  const before = new Map(current.map(ex => [String(ex.id), ex])); const after = new Map(exercises.map(ex => [String(ex.id), ex]))
  const added = exercises.filter(ex => !before.has(String(ex.id)))
  const removed = current.filter(ex => !after.has(String(ex.id)))
  const changed = exercises.filter(ex => before.has(String(ex.id)) && comparable(ex) !== comparable(before.get(String(ex.id))))
  return { ok: true, exercises, added, removed, changed, unchanged: exercises.length - added.length - changed.length }
}
