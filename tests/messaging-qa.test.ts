import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smsLimit, smsSegments } from '../src/lib/smsUsage'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
const { env } = await import('../server/env')
const { admin } = await import('../server/db')
const { phoneOf, personalize, twilio, twilioReason } = await import('../server/messaging')
const { sendWhatsApp } = await import('../server/whatsapp')

test('international number formatting and personalization', () => {
  assert.deepEqual(['essentials', 'plus', 'max'].map(smsLimit), [10, 20, 30])
  assert.equal(smsSegments('a'.repeat(160)), 1)
  assert.equal(smsSegments('a'.repeat(161)), 2)
  assert.equal(smsSegments('^'.repeat(81)), 2)
  assert.equal(smsSegments('漢'.repeat(70)), 1)
  assert.equal(smsSegments('漢'.repeat(71)), 2)
  assert.equal(smsSegments('😀'.repeat(36)), 2)
  assert.equal(phoneOf('00234 803-123-4567'), '+2348031234567')
  assert.equal(phoneOf('+34 (600) 123 456'), '+34600123456')
  assert.equal(personalize('Hi {first_name}, {church}: {topic}', 'en', { topic: 'Sunday' }, 'Ada', 'Grace'), 'Hi Ada, Grace: Sunday')
  assert.match(twilioReason(63015), /sandbox/)
  assert.match(twilioReason(21408), /country/)
})

test('provider requests, errors and 1000 concurrent simulated SMS sends', async () => {
  assert.ok(admin)
  const originalRpc = admin.rpc
  admin.rpc = (async () => ({ data: true, error: null })) as unknown as typeof admin.rpc
  const originalFetch = globalThis.fetch
  const original = { ...env }
  const requests: { url: string; body: URLSearchParams | Record<string, unknown> }[] = []
  let fail = false
  Object.assign(env, { twilioSid: 'AC-test', twilioToken: 'fake', twilioMessagingService: 'MG-test', twilioSmsFrom: '+15550000001', twilioWhatsappFrom: '+15550000002', twilioWhatsappContentSid: 'HX-test', apiUrl: 'https://api.example', waToken: 'fake', waPhoneId: 'test', waTemplate: 'church_message' })
  globalThis.fetch = (async (url, init) => {
    const isMeta = String(url).includes('graph.facebook.com')
    requests.push({ url: String(url), body: isMeta ? JSON.parse(String(init?.body)) : new URLSearchParams(String(init?.body)) })
    if (fail) return new Response(JSON.stringify({ code: 21408, message: 'disabled' }), { status: 400 })
    return new Response(JSON.stringify(isMeta ? { messages: [{ id: 'wamid-test' }] } : { sid: 'SM-test' }), { status: 201 })
  }) as typeof fetch
  try {
    await assert.rejects(twilio('SMS', '08031234567', 'Hello'), /country code/)
    assert.equal(requests.length, 0)
    await assert.rejects(twilio('SMS', '+15550000003', 'Hello'), /church is required/)
    admin.rpc = (async () => ({ data: false, error: null })) as unknown as typeof admin.rpc
    await assert.rejects(twilio('SMS', '+15550000003', 'Hello', { churchId: 'church-test' }), /monthly SMS allowance/)
    assert.equal(requests.length, 0, 'Quota exhaustion must prevent provider submission')
    admin.rpc = (async () => ({ data: null, error: { message: 'database unavailable' } })) as unknown as typeof admin.rpc
    await assert.rejects(twilio('SMS', '+15550000003', 'Hello', { churchId: 'church-test' }), /Could not reserve/)
    assert.equal(requests.length, 0, 'Database failures must fail closed')
    admin.rpc = (async () => ({ data: true, error: null })) as unknown as typeof admin.rpc
    await twilio('SMS', '+15550000003', 'Hello', { churchId: 'church-test' })
    const sms = requests.at(-1)!.body as URLSearchParams
    assert.equal(sms.get('MessagingServiceSid'), 'MG-test')
    assert.equal(sms.get('StatusCallback'), 'https://api.example/api/twilio/status')
    env.twilioMessagingService = ''
    await twilio('SMS', '+15550000003', 'Hello', { churchId: 'church-test' })
    assert.equal((requests.at(-1)!.body as URLSearchParams).get('From'), '+15550000001')
    await twilio('WhatsApp', '+15550000003', 'Hello\nAda')
    const wa = requests.at(-1)!.body as URLSearchParams
    assert.equal(wa.get('ContentSid'), 'HX-test')
    assert.equal(JSON.parse(wa.get('ContentVariables')!)['1'], 'Hello · Ada')
    await twilio('WhatsApp', '+15550000003', 'Reply', { freeform: true })
    assert.equal((requests.at(-1)!.body as URLSearchParams).get('ContentSid'), null)
    await sendWhatsApp('+34 600123456', 'Hello', 'pt')
    const meta = requests.at(-1)!.body as { to: string; template: { language: { code: string } } }
    assert.equal(meta.to, '34600123456')
    assert.equal(meta.template.language.code, 'pt_PT')
    fail = true
    await assert.rejects(twilio('SMS', '+15550000003', 'Hello', { churchId: 'church-test' }), /country/)
    fail = false
    const start = requests.length
    const results = await Promise.all(Array.from({ length: 1000 }, () => twilio('SMS', '+15550000003', 'Load test', { churchId: 'church-test' })))
    assert.equal(results.length, 1000)
    assert.equal(requests.length - start, 1000)
    assert.ok(results.every(id => id === 'SM-test'))
  } finally {
    admin.rpc = originalRpc
    globalThis.fetch = originalFetch
    Object.assign(env, original)
  }
})
