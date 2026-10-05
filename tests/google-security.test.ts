import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import { createHmac } from 'node:crypto'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
process.env.GOOGLE_CLIENT_ID = 'test-client'
process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
const { env } = await import('../server/env')
const { admin } = await import('../server/db')
const { googleRoutes } = await import('../server/routes/google')
const { validSignature } = await import('../server/whatsapp')

test('WhatsApp webhooks fail closed and require a valid signature', () => {
  const previous = env.waAppSecret
  const raw = Buffer.from('{"test":true}')
  try {
    env.waAppSecret = ''
    assert.equal(validSignature(raw, undefined), false)
    env.waAppSecret = 'test-secret'
    assert.equal(validSignature(raw, 'sha256=invalid'), false)
    const signature = `sha256=${createHmac('sha256', env.waAppSecret).update(raw).digest('hex')}`
    assert.equal(validSignature(raw, signature), true)
    assert.equal(validSignature(Buffer.from('tampered'), signature), false)
  } finally { env.waAppSecret = previous }
})

test('Meet waits for pending conferences and keeps connections after temporary token failures', async () => {
  assert.ok(admin, 'Local Supabase configuration is required (no real database calls are made).')
  const church = '11111111-1111-1111-1111-111111111111'
  const event = { id: '22222222-2222-2222-2222-222222222222', church_id: church, date: '2026-10-06', start_time: '09:00', end_time: '10:00', title: 'Test' }
  const originalFrom = admin.from
  const originalGetUser = admin.auth.getUser
  const originalFetch = globalThis.fetch
  const updates: unknown[] = []
  let deletes = 0
  let outage = false
  let revoked = false
  let inserts = 0
  let polls = 0
  admin.auth.getUser = (async () => ({ data: { user: { id: 'test-user', email: 'test@example.com', email_confirmed_at: '2026-01-01' } }, error: null })) as typeof admin.auth.getUser
  admin.from = ((table: string) => {
    let result: unknown = table === 'church_users' ? { role: 'admin' } : table === 'events' ? event : table === 'churches' ? { name: 'Test' } : { refresh_token: 'fake' }
    const query = {
      select() { return query }, eq() { return query },
      maybeSingle: async () => ({ data: result, error: null }),
      single: async () => ({ data: result, error: null }),
      update(value: unknown) { updates.push(value); result = null; return query },
      delete() { deletes++; return query },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: result, error: null }).then(resolve) },
    }
    return query
  }) as typeof admin.from
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes('googleapis.com')) return originalFetch(input, init)
    if (url.includes('/token')) return Response.json(outage ? { error: revoked ? 'invalid_grant' : 'temporarily_unavailable' } : { access_token: 'fake' }, { status: outage ? 503 : 200 })
    if (init?.method === 'POST') {
      inserts++
      assert.equal(JSON.parse(String(init.body)).id, event.id.replace(/-/g, ''))
      return Response.json({ id: 'calendar-id', conferenceData: { createRequest: { status: { statusCode: 'pending' } } } })
    }
    polls++
    return Response.json({ id: 'calendar-id', hangoutLink: 'https://meet.google.com/abc-defg-hij' })
  }) as typeof fetch
  const app = express().use(express.json()).use(googleRoutes)
  app.use((error: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const request = () => originalFetch(`http://127.0.0.1:${address.port}/events/${event.id}/meet`, { method: 'POST', headers: { Authorization: 'Bearer fake', 'x-church-id': church, 'Content-Type': 'application/json' }, body: '{"timeZone":"UTC"}' })
  try {
    const response = await request()
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { link: 'https://meet.google.com/abc-defg-hij' })
    assert.equal(inserts, 1)
    assert.equal(polls, 1)
    assert.equal(updates.length, 2)
    Object.assign(event, { google_event_id: 'calendar-id' })
    assert.equal((await request()).status, 200)
    assert.equal(inserts, 1, 'Retries must reuse the saved Calendar event')
    outage = true
    assert.equal((await request()).status, 502)
    assert.equal(deletes, 0)
    revoked = true
    assert.equal((await request()).status, 502)
    assert.equal(deletes, 1, 'Revoked consent must remove the connection')
  } finally {
    server.close()
    admin.from = originalFrom
    admin.auth.getUser = originalGetUser
    globalThis.fetch = originalFetch
  }
})
