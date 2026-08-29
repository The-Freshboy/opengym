/* Production OpenAI Responses API adapter. The project key arrives only through the
 * sanitised job environment and is never written to disk or included in diagnostics. */
const ENDPOINT = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5.4-mini'
const SYSTEM = 'You are the OpenGym Coach. Return only the JSON requested by the supplied task. Do not add markdown or commentary.'

const outputText = body => {
  if (typeof body?.output_text === 'string') return body.output_text
  return (body?.output || []).flatMap(item => item?.content || [])
    .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text).join('')
}

export default {
  id: 'openai', runtime: 'OpenAI Responses API',
  async check() { return { ok: true, version: 'Responses API' } },
  async invoke({ prompt, env, model, timeoutMs, safetyIdentifier }) {
    const key = env.OPENAI_API_KEY
    if (!key) return { code: 1, text: '', stderr: 'OpenAI API key is not configured', timedOut: false, spawnError: false }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || DEFAULT_MODEL, instructions: SYSTEM, input: prompt,
          max_output_tokens: 12000,
          ...(safetyIdentifier ? { safety_identifier: safetyIdentifier } : {})
        })
      })
      const raw = await response.text()
      let body = null
      try { body = JSON.parse(raw) } catch { /* reported below */ }
      if (!response.ok) {
        const type = body?.error?.type || body?.error?.code || `HTTP ${response.status}`
        const message = body?.error?.message || 'OpenAI request failed'
        return { code: response.status, text: '', stderr: `${type}: ${message}`.slice(0, 1000), timedOut: false, spawnError: false }
      }
      const text = outputText(body)
      return text
        ? { code: 0, text, stderr: '', timedOut: false, spawnError: false, usage: body?.usage || null }
        : { code: 1, text: '', stderr: 'OpenAI returned no text output', timedOut: false, spawnError: false }
    } catch (error) {
      if (error?.name === 'AbortError') return { code: -1, text: '', stderr: '', timedOut: true, spawnError: false }
      return { code: -1, text: '', stderr: String(error?.message || error).slice(0, 500), timedOut: false, spawnError: true }
    } finally { clearTimeout(timer) }
  }
}

export { outputText, DEFAULT_MODEL }
