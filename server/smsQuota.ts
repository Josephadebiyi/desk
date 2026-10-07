import { db, HttpError } from './db'
import { smsLimit, smsSegments } from '../src/lib/smsUsage'

export const smsMonth = () => new Date().toISOString().slice(0, 7) + '-01'

export async function smsUsage(churchId: string) {
  const { data: church, error } = await db().from('churches').select('plan').eq('id', churchId).single()
  if (error || !church) throw new HttpError(503, 'Could not read the SMS allowance.')
  const { data, error: usageError } = await db().from('sms_monthly_usage').select('used').eq('church_id', churchId).eq('month', smsMonth()).maybeSingle()
  if (usageError) throw new HttpError(503, 'SMS allowances need the latest database migration.')
  const limit = smsLimit(church.plan)
  const used = data?.used ?? 0
  return { month: smsMonth(), used, limit, remaining: Math.max(0, limit - used) }
}

/** Reserve atomically before submission. Attempts remain counted after ambiguous provider failures. */
export async function reserveSms(churchId: string, text: string) {
  const { data, error } = await db().rpc('reserve_sms_segments', { p_church: churchId, p_segments: smsSegments(text) })
  if (error) throw new HttpError(503, 'Could not reserve the SMS allowance. Please try again later.')
  if (!data) throw new HttpError(429, 'Your church has reached its monthly SMS allowance. It resets next calendar month (UTC).')
}
