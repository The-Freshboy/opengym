// No provider SDK, browser cookies, or paid API. A token may only read / propose.
import fs from 'node:fs'

const [command, ...args] = process.argv.slice(2)
const options = {}
for (let i = 0; i < args.length; i += 2) {
  if (!['--url', '--token-file', '--proposal-file'].includes(args[i]) || !args[i + 1]) {
    console.error('Use: node scripts/training-integration.mjs context|propose --url https://gym.example --token-file /private/token [--proposal-file proposal.json]')
    process.exit(1)
  }
  options[args[i]] = args[i + 1]
}

try {
  if (!['context', 'propose'].includes(command)) throw new Error('Choose context or propose; direct changes are not supported.')
  const base = new URL(options['--url'])
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/')
    throw new Error('Use an HTTPS server origin without credentials, path, query or fragment.')
  const tokenPath = options['--token-file']
  if (!tokenPath) throw new Error('A private token file is required. Do not put tokens on the command line.')
  const stat = fs.lstatSync(tokenPath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024) throw new Error('Token must be a small regular file, not a link.')
  if (process.platform !== 'win32' && (stat.mode & 0o077)) throw new Error('Token file must only be accessible to its owner (chmod 600).')
  const token = fs.readFileSync(tokenPath, 'utf8').trim()
  if (!token || /\s/.test(token)) throw new Error('Invalid token file.')
  let body
  if (command === 'propose') {
    if (!options['--proposal-file']) throw new Error('A proposal JSON file is required.')
    if (fs.statSync(options['--proposal-file']).size > 256 * 1024) throw new Error('Proposal file exceeds 256 KB.')
    body = JSON.stringify(JSON.parse(fs.readFileSync(options['--proposal-file'], 'utf8')))
  }
  const response = await fetch(new URL('/api/integration/v1/' + (command === 'context' ? 'context' : 'proposals'), base), {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body
  })
  // Never print request headers, credentials or raw server errors.
  if (!response.ok) throw new Error(`OpenGYM returned HTTP ${response.status}. Check access, scope, expiry and proposal revision.`)
  const result = await response.json()
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} catch (error) {
  // Do not expose fetch internals (which may contain request metadata).
  const safe = ['Use an HTTPS', 'Choose context', 'A private token', 'Token must', 'Token file', 'Invalid token', 'A proposal', 'Proposal file', 'OpenGYM returned']
  console.error(safe.some(prefix => error.message.startsWith(prefix)) ? error.message : 'Could not complete the request. Check the files, JSON and secure server connection.')
  process.exitCode = 1
}
