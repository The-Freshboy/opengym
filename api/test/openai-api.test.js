import test from 'node:test'
import assert from 'node:assert/strict'
import openai, { outputText, DEFAULT_MODEL } from '../coach/adapters/openai-api.js'

test('extracts Responses API output text without accepting unrelated content', () => {
  assert.equal(outputText({ output: [{ content: [{ type: 'reasoning', text: 'hidden' }, { type: 'output_text', text: '{"ok":true}' }] }] }), '{"ok":true}')
  assert.equal(outputText({ output_text: 'direct' }), 'direct')
  assert.equal(outputText({ output: [] }), '')
})

test('uses a cost-efficient production default', () => {
  assert.equal(DEFAULT_MODEL, 'gpt-5.4-mini')
  assert.equal(openai.runtime, 'OpenAI Responses API')
})

test('fails closed before making a request when the key is absent', async () => {
  const result = await openai.invoke({ prompt: 'x', env: {}, timeoutMs: 10, safetyIdentifier: 'anon' })
  assert.equal(result.code, 1)
  assert.match(result.stderr, /not configured/)
})
