import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = file => fs.readFileSync(root + file, 'utf8')

test('every nginx response class keeps the shared security headers', () => {
  const nginx = read('web/nginx.conf')
  assert.equal((nginx.match(/include \/etc\/nginx\/snippets\/opengym-security-headers\.conf;/g) || []).length, 3)
  const headers = read('web/security-headers.conf')
  for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Permissions-Policy', 'Referrer-Policy']) assert.match(headers, new RegExp(name))
  assert.match(read('web/Dockerfile'), /COPY web\/security-headers\.conf \/etc\/nginx\/snippets\/opengym-security-headers\.conf/)
})

test('the static web container prohibits gaining new privileges', () => {
  const compose = read('docker-compose.yml')
  assert.equal((compose.match(/no-new-privileges:true/g) || []).length, 1)
})
