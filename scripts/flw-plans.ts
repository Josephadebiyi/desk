/**
 * Creates the three monthly ZionDesk plans in your Flutterwave account (run once):
 *   FLW_SECRET_KEY=... npm run flw:plans
 * Then copy the printed FLW_PLAN_* lines into Render → Environment.
 */
import { createPaymentPlan } from '../server/flutterwave'
import { PLAN_PRICE } from '../server/routes/payments'

const names: Record<string, string> = { essentials: 'ZionDesk Essentials', plus: 'ZionDesk Ministry Plus', max: 'ZionDesk Ministry Max' }
for (const [id, amount] of Object.entries(PLAN_PRICE)) {
  const plan = await createPaymentPlan(names[id], amount, 'USD')
  console.log(`FLW_PLAN_${id.toUpperCase()}=${plan.id}`)
}
