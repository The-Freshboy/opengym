import test from 'node:test'
import assert from 'node:assert/strict'
import { publicAddress, validPushEndpoint, publicLookup } from '../push-transport.js'

test('push destination only permits bounded public HTTPS hostnames', () => {
  assert.equal(validPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true)
  for (const endpoint of ['http://example.com/push', 'https://127.0.0.1/', 'https://[::1]/', 'https://host.local/', 'https://example.com:8080/', 'https://user:pass@example.com/']) assert.equal(validPushEndpoint(endpoint), false, endpoint)
})
test('private, mapped, reserved and Tailscale addresses are blocked', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '100.100.100.100', '169.254.169.254', '192.168.1.1', '::1', 'fd7a:115c:a1e0::1', '::ffff:127.0.0.1', '2001:db8::1']) assert.equal(publicAddress(address), false, address)
  assert.equal(publicAddress('8.8.8.8'), true)
  assert.equal(publicAddress('2606:4700:4700::1111'), true)
})
test('connection lookup rejects mixed public/private answers and pins allowed resolution', async () => {
  const lookup = rows => (host, opts, cb) => cb(null, rows)
  await new Promise(resolve => publicLookup('push.example', {}, error => { assert.match(error.message, /public addresses/); resolve() }, lookup([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }])))
  await new Promise(resolve => publicLookup('push.example', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); resolve() }, lookup([{ address: '8.8.8.8', family: 4 }])))
})
