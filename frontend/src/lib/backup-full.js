const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype

export function validateFullBackup(data) {
  if (!plain(data)) throw new Error('not an OpenGym backup')
  if (!Array.isArray(data.workouts) || !Array.isArray(data.routines)) throw new Error('not an OpenGym backup')
  if (data.workouts.length > 10000 || data.routines.length > 500) throw new Error('backup contains too many records')
  const arrays = ['bodyweight', 'customEx']
  for (const key of arrays) if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].length > 10000)) throw new Error(`invalid ${key}`)
  if (JSON.stringify(data).length > 5 * 1024 * 1024) throw new Error('backup is larger than 5 MB')
  return data
}
