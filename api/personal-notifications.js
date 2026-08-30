import fs from 'node:fs'
import path from 'node:path'

// Canberra observes the same daylight-saving rules as Sydney. Not the host's timezone.
export function canberraWeek(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(x => [x.type, x.value]))
  const day = `${p.year}-${p.month}-${p.day}`
  return { day, due: p.weekday === 'Sun' && Number(p.hour) >= 19 }
}

export function createPersonalNotifier({ dataDir, users, readState, env = process.env, fetcher = fetch, now = () => new Date() }) {
  const file = path.join(dataDir, 'personal-notifications.json')
  let running = false
  const configured = !!(env.NTFY_URL && env.NTFY_TOPIC_FILE && env.NTFY_TOKEN_FILE)
  const tick = async () => {
    if (running || !configured) return { sent: 0 }
    const time = canberraWeek(now()); if (!time.due) return { sent: 0 }
    running = true
    try {
      const all = users().filter(u => !u.disabled)
      // Never broadcast multiple profiles to the same topic implicitly.
      const selected = env.NTFY_PROFILE_ID ? all.filter(u => u.id === env.NTFY_PROFILE_ID) : (all.length === 1 ? all : [])
      let state = {}
      try { state = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw new Error('Notification state unreadable; refusing to resend') }
      let sent = 0
      for (const user of selected) {
        if (!readState(user.id)?.personal?.weeklySummary || state[user.id] === time.day) continue
        const topic = fs.readFileSync(env.NTFY_TOPIC_FILE, 'utf8').trim()
        const token = fs.readFileSync(env.NTFY_TOKEN_FILE, 'utf8').trim()
        if (!topic || !token) continue
        const url = new URL(env.NTFY_URL)
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid ntfy server URL')
        const response = await fetcher(`${url.toString().replace(/\/$/, '')}/${encodeURIComponent(topic)}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, Title: 'OpenGym weekly summary', Tags: 'weight_lifter,calendar' },
          body: 'Your weekly training summary is ready. Open OpenGym to see your progress and review any pending suggestions.', signal: AbortSignal.timeout(15000)
        })
        if (!response.ok) throw new Error(`Weekly notification failed (HTTP ${response.status})`)
        state[user.id] = time.day
        fs.writeFileSync(file + '.tmp', JSON.stringify(state), { mode: 0o600 }); fs.renameSync(file + '.tmp', file)
        sent++
      }
      return { sent }
    } finally { running = false }
  }
  return { configured, tick }
}
