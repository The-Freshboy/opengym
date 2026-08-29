import test from 'node:test'
import assert from 'node:assert/strict'
import { createRateLimiter } from '../rate-limit.js'

test('rate limiter isolates keys and resets its window', () => {
  let time = 1000
  const check = createRateLimiter({ now: () => time })
  assert.equal(check('a', 2, 1000), null)
  assert.equal(check('a', 2, 1000), null)
  assert.equal(check('b', 2, 1000), null)
  assert.equal(check('a', 2, 1000), 1)
  time = 2000
  assert.equal(check('a', 2, 1000), null)
})
