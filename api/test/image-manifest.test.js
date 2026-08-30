import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('API image copies every top-level local server import', () => {
  const root = new URL('../', import.meta.url)
  const server = fs.readFileSync(new URL('server.js', root), 'utf8')
  const dockerfile = fs.readFileSync(new URL('Dockerfile', root), 'utf8')
  const copies = dockerfile.split('\n').filter(line => line.startsWith('COPY ')).join(' ')
  for (const [, name] of server.matchAll(/from ['"]\.\/([^/'"]+\.js)['"]/g)) assert.ok(copies.includes(name), `Missing image source: ${name}`)
})
