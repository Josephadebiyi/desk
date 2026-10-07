// Isolated API QA/load test. No .env, database, provider keys or production traffic.
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
const root = process.cwd()
const cwd = await mkdtemp(resolve(tmpdir(), 'ziondesk-qa-'))
const port = 18787
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['--import', resolve(root, 'node_modules/tsx/dist/loader.mjs'), resolve(root, 'server/index.ts')], {
  cwd, env: { PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', d => { logs = (logs + d).slice(-4000) })
child.stderr.on('data', d => { logs = (logs + d).slice(-4000) })
const report = { scope: 'Local isolated API; integrations disabled; no authenticated database workflows', smoke: [], load: [] }
async function request(path, options = {}) {
  const start = performance.now()
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) })
  await response.arrayBuffer()
  return { status: response.status, ms: performance.now() - start }
}
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/api/health')).status === 200) { ready = true; break } } catch {}
    if (child.exitCode !== null) throw new Error(logs)
    await new Promise(r => setTimeout(r, 100))
  }
  if (!ready) throw new Error(`API did not start: ${logs}`)
  const cases = [
    ['health', '/api/health', {}, 200],
    ['unknown API', '/api/does-not-exist', {}, 404],
    ['campaign requires sign-in', '/api/campaigns/test/send', { method: 'POST' }, 401],
    ['team requires sign-in', '/api/team/invite', { method: 'POST' }, 401],
    ['transfer requires sign-in', '/api/claims/test/confirm', { method: 'POST' }, 401],
    ['cron requires secret', '/api/cron/hourly', { method: 'POST' }, 401],
    ['WhatsApp rejects unsigned webhook', '/api/whatsapp/webhook', { method: 'POST', body: '{}' }, 401],
    ['Twilio rejects unsigned webhook', '/api/twilio/status', { method: 'POST' }, 403],
    ['CORS rejects unknown origin', '/api/health', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }, 403],
    ['CORS accepts site origin', '/api/health', { method: 'OPTIONS', headers: { Origin: 'https://ziondesk.com' } }, 204],
    ['invalid unsubscribe', '/api/email/unsubscribe', {}, 400],
    ['invalid trial email', '/api/start-trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"invalid"}' }, 400],
    ['malformed JSON', '/api/start-trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }, 400],
  ]
  for (const [name, path, options, expected] of cases) {
    const result = await request(path, options)
    report.smoke.push({ name, expected, ...result, pass: result.status === expected })
  }
  const paths = ['/api/health', '/api/does-not-exist', '/api/campaigns/test/send']
  for (const concurrency of [10, 50, 100]) {
    const count = 10000
    let cursor = 0
    const times = []
    const statuses = {}
    let errors = 0
    let unexpected = 0
    const start = performance.now()
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (cursor < count) {
        const i = cursor++
        try {
          const result = await request(paths[i % 3], i % 3 === 2 ? { method: 'POST' } : {})
          times.push(result.ms)
          statuses[result.status] = (statuses[result.status] || 0) + 1
          if (result.status !== [200, 404, 401][i % 3]) unexpected++
        } catch { errors++ }
      }
    }))
    const seconds = (performance.now() - start) / 1000
    times.sort((a, b) => a - b)
    const percentile = p => Number((times[Math.min(times.length - 1, Math.floor(times.length * p))] || 0).toFixed(2))
    report.load.push({ concurrency, count, seconds: Number(seconds.toFixed(2)), requestsPerSecond: Math.round(count / seconds), p50ms: percentile(.5), p95ms: percentile(.95), p99ms: percentile(.99), errors, unexpected, statuses })
  }
  await writeFile(resolve(root, 'qa-stress-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (report.smoke.some(r => !r.pass) || report.load.some(r => r.errors || r.unexpected)) process.exitCode = 1
} finally {
  child.kill('SIGTERM')
  await new Promise(r => child.exitCode !== null ? r() : child.once('exit', r))
  await rm(cwd, { recursive: true, force: true })
}
