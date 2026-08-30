export const TIMER_DEFAULTS = { countdown: 10, warmup: 0, hang: 5, rest: 90, sets: 2, recovery: 120, cycles: 1, cooldown: 0 }
export const TIMER_FIELDS = { countdown: 'Initial countdown', warmup: 'Warm-up interval', hang: 'Hang interval', rest: 'Rest between sets', sets: 'Sets per cycle', recovery: 'Recovery between cycles', cycles: 'Cycles', cooldown: 'Cooldown interval' }
export function timerError(config) {
  for (const key of Object.keys(TIMER_FIELDS)) {
    const value = Number(config[key]), count = key === 'sets' || key === 'cycles'
    if (config[key] === '' || !Number.isInteger(value) || value < (count || key === 'hang' ? 1 : 0) || value > (count ? 50 : 3600)) return `${TIMER_FIELDS[key]} must be a whole number between ${count || key === 'hang' ? 1 : 0} and ${count ? 50 : 3600}.`
  }
  if (Number(config.sets) * Number(config.cycles) > 200) return 'Use no more than 200 total sets.'
  return null
}
export function timerPhases(config) {
  if (timerError(config)) return []
  const c = Object.fromEntries(Object.keys(TIMER_FIELDS).map(k => [k, Number(config[k])]))
  const phases = []
  const add = (kind, seconds, cycle = 0, set = 0) => { if (seconds) phases.push({ kind, seconds, cycle, set }) }
  add('Get ready', c.countdown); add('Warm up', c.warmup)
  for (let cycle = 1; cycle <= c.cycles; cycle++) {
    for (let set = 1; set <= c.sets; set++) {
      add('Hang', c.hang, cycle, set)
      if (set < c.sets) add('Rest', c.rest, cycle, set)
    }
    if (cycle < c.cycles) add('Recover', c.recovery, cycle)
  }
  add('Cool down', c.cooldown)
  return phases
}
export function phaseRemaining(deadline, now) { return Math.max(0, deadline - now) }
