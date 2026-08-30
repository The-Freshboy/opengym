import test from 'node:test'
import assert from 'node:assert/strict'
import { browserWriteError, stateInputError, clientAddress } from '../request-guards.js'

test('cookie writes require JSON and exact same origin including sibling domains', () => {
  const req = { method: 'POST', headers: { cookie: 'gymsid=signed', 'content-type': 'application/json', origin: 'https://gym.example' } }
  assert.equal(browserWriteError(req, 'https://gym.example'), null)
  assert.equal(browserWriteError({ ...req, headers: { ...req.headers, origin: 'https://other.example' } }, 'https://gym.example').status, 403)
  assert.equal(browserWriteError({ ...req, headers: { ...req.headers, origin: undefined } }, 'https://gym.example').status, 403)
  assert.equal(browserWriteError({ ...req, headers: { ...req.headers, 'content-type': 'text/plain' } }, 'https://gym.example').status, 415)
  assert.equal(browserWriteError({ method: 'GET', headers: {} }, 'https://gym.example'), null)
  assert.equal(browserWriteError({ method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' } }, 'https://gym.example'), null)
})
test('state shape and array limits are bounded without stripping clinical fields', () => {
  assert.match(stateInputError([]), /object/)
  assert.match(stateInputError({ routines: [{ ex: 'bad' }] }), /routine/)
  assert.match(stateInputError({ workouts: Array(20001) }), /workouts/)
  const state = { workouts: [{ feedback: { tingling: true }, entries: [{ hangContext: { support: 'feet' }, sets: [{ type: 'warmup' }] }] }] }
  assert.equal(stateInputError(state), null)
  assert.equal(state.workouts[0].feedback.tingling, true)
})
test('forwarded address is ignored unless operator explicitly trusts its proxy', () => {
  const req = { headers: { 'x-forwarded-for': 'spoofed, proxy' }, socket: { remoteAddress: 'socket' } }
  assert.equal(clientAddress(req), 'socket')
  assert.equal(clientAddress(req, true), 'spoofed')
})
