import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRateLimiter, jsonContentTypeAllowed, originAllowed, validPushSubscription } from '../security.js';

const req = (method, headers = {}) => ({ method, headers });

test('unsafe methods require the exact configured origin', () => {
  assert.equal(originAllowed(req('POST', { origin: 'https://gym.example.com' }), 'https://gym.example.com'), true);
  assert.equal(originAllowed(req('POST', { origin: 'https://evil.example' }), 'https://gym.example.com'), false);
  assert.equal(originAllowed(req('POST', { origin: 'https://attacker.gym.example.com' }), 'https://gym.example.com'), false);
  assert.equal(originAllowed(req('POST'), 'https://gym.example.com'), false);
  assert.equal(originAllowed(req('GET'), 'https://gym.example.com'), true);
});

test('unsafe methods require JSON while GET remains unaffected', () => {
  assert.equal(jsonContentTypeAllowed(req('POST', { 'content-type': 'application/json; charset=utf-8' })), true);
  assert.equal(jsonContentTypeAllowed(req('POST', { 'content-type': 'text/plain' })), false);
  assert.equal(jsonContentTypeAllowed(req('POST')), false);
  assert.equal(jsonContentTypeAllowed(req('GET')), true);
});

test('push endpoint allowlist blocks SSRF destinations', () => {
  const sub = endpoint => ({ endpoint, keys: { p256dh: 'a', auth: 'b' } });
  for (const endpoint of [
    'http://fcm.googleapis.com/send/x', 'https://127.0.0.1/x', 'https://[::1]/x',
    'https://10.0.0.1/x', 'https://169.254.1.1/x', 'https://localhost/x',
    'https://user:pass@fcm.googleapis.com/x', 'not a url'
  ]) assert.equal(validPushSubscription(sub(endpoint)), false, endpoint);
  assert.equal(validPushSubscription(sub('https://fcm.googleapis.com/fcm/send/example')), true);
  assert.equal(validPushSubscription(sub('https://updates.push.services.mozilla.com/wpush/v2/example')), true);
});

test('rate limiter is deterministic and bounded by its configured count', () => {
  const limit = createRateLimiter({ windowMs: 60_000, max: 2, maxEntries: 2 });
  assert.equal(limit('a').allowed, true);
  assert.equal(limit('a').allowed, true);
  assert.equal(limit('a').allowed, false);
  limit('b'); limit('c');
  assert.equal(limit('c').allowed, true);
});

test('server pins WebAuthn UV and minimal public health response', () => {
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.equal((source.match(/userVerification: 'required'/g) || []).length, 2);
  assert.equal((source.match(/requireUserVerification: true/g) || []).length, 2);
  assert.match(source, /GET \/api\/health[^\n]+\{ ok: true \}/);
  assert.doesNotMatch(source, /GET \/api\/health[^\n]+users/);
});
