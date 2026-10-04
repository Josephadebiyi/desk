/**
 * WhatsApp webhook (Meta → WhatsApp → Configuration → Webhook):
 *   Callback URL  https://<your-site>/api/whatsapp/webhook
 *   Verify token  the WHATSAPP_VERIFY_TOKEN value; subscribe to the "messages" field.
 * Delivery receipts update each message's status (sent → delivered → read / failed).
 */
import express, { Router } from 'express'
import { db } from '../db'
import { env } from '../env'
import { validSignature } from '../whatsapp'

export const whatsappRoutes = Router()

whatsappRoutes.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && env.waVerifyToken && req.query['hub.verify_token'] === env.waVerifyToken) return res.send(String(req.query['hub.challenge'] ?? ''))
  res.sendStatus(403)
})

interface Status {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  errors?: { title?: string; message?: string }[]
}

whatsappRoutes.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = req.body as Buffer
  if (!validSignature(raw, req.header('x-hub-signature-256'))) return res.sendStatus(401)
  res.sendStatus(200) // answer fast; Meta retries slow webhooks
  try {
    const body = JSON.parse(raw.toString('utf8')) as { entry?: { changes?: { value?: { statuses?: Status[] } }[] }[] }
    for (const entry of body.entry ?? [])
      for (const change of entry.changes ?? [])
        for (const s of change.value?.statuses ?? []) {
          const status = s.status === 'failed' ? 'failed' : s.status
          await db()
            .from('deliveries')
            .update({ status, error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null })
            .eq('provider_id', s.id)
        }
  } catch (e) {
    console.error('[whatsapp webhook]', e)
  }
})
