/**
 * POST /api/ai — Church AI provider proxy (Vercel serverless function).
 *
 * Keeps provider API keys on the server. The browser sends a normalised request;
 * this function calls the chosen provider and returns a normalised response:
 *   { text, toolCalls: [{ id, name, input }], usage: { provider, model, inputTokens, outputTokens, estCostUsd } }
 *
 * The model NEVER gets database access: it can only *request* tool calls. Tools are
 * executed by the ZionDesk tool layer (src/ai/tools.ts → later server-side), which
 * authenticates, resolves the church, checks permissions, validates inputs and audits.
 *
 * Environment variables (configure only the providers you use):
 *   ANTHROPIC_API_KEY            Claude (official SDK)
 *   ANTHROPIC_MODEL              default claude-opus-5-5
 *   GEMINI_API_KEY, GEMINI_MODEL Gemini (REST generateContent) — set GEMINI_MODEL explicitly
 *   OPENAI_API_KEY, OPENAI_MODEL OpenAI (REST chat completions) — set OPENAI_MODEL explicitly
 */
import Anthropic from '@anthropic-ai/sdk'

type Role = 'user' | 'assistant'
interface ChatMessage {
  role: Role
  content: string
  /** Images attached to this message (base64, no data: prefix). Max 4 per message. */
  images?: { mediaType: string; data: string }[]
}
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const imgs = (m: ChatMessage) => (m.images ?? []).filter((i) => IMAGE_TYPES.includes(i.mediaType) && typeof i.data === 'string').slice(0, 4)
interface ToolSpec {
  name: string
  description: string
  input_schema: Record<string, unknown>
}
interface AiRequest {
  provider: 'claude' | 'gemini' | 'openai'
  system: string
  messages: ChatMessage[]
  tools?: ToolSpec[]
  maxTokens?: number
}
interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}
interface AiResponse {
  text: string
  toolCalls: ToolCall[]
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number; estCostUsd: number }
}
interface Req {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

/* Prices per 1M tokens, used for internal cost tracking only. Keep in sync with provider pricing. */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}
const cost = (model: string, i: number, o: number) => {
  const p = PRICES[model]
  return p ? (i * p.in + o * p.out) / 1e6 : 0
}

/* Very small per-instance rate limiter (best effort; use a shared store such as Redis in production). */
const hits = new Map<string, number[]>()
function limited(key: string, perMinute = 30) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(key, recent)
  return recent.length > perMinute
}

/* ───────── Claude (official SDK) ───────── */

async function callClaude(r: AiRequest): Promise<AiResponse> {
  const client = new Anthropic() // reads ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
  const params = {
    model,
    max_tokens: r.maxTokens ?? 16000,
    system: r.system,
    messages: r.messages.map((m) =>
      imgs(m).length
        ? { role: m.role, content: [...imgs(m).map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.data } })), { type: 'text' as const, text: m.content }] }
        : { role: m.role, content: m.content },
    ),
    tools: (r.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
    tool_choice: { type: 'auto' as const },
    output_config: { effort: 'medium' as const },
    // Server-side refusal fallback: if the model declines, the API re-runs on a suitable fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  }
  // `fallbacks` / `output_config` may be newer than the installed SDK's typings.
  const msg = (await client.beta.messages.create(params as never)) as Anthropic.Beta.BetaMessage

  if (msg.stop_reason === 'refusal') {
    return { text: "I can't help with that request.", toolCalls: [], usage: usageOf('claude', model, msg.usage.input_tokens, msg.usage.output_tokens) }
  }
  let text = ''
  const toolCalls: ToolCall[] = []
  for (const block of msg.content) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> })
  }
  return { text, toolCalls, usage: usageOf('claude', msg.model ?? model, msg.usage.input_tokens, msg.usage.output_tokens) }
}

/* ───────── Gemini (REST) ───────── */

async function callGemini(r: AiRequest): Promise<AiResponse> {
  const key = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL
  if (!key || !model) throw new Error('Gemini is not configured (GEMINI_API_KEY / GEMINI_MODEL).')
  const body = {
    systemInstruction: { parts: [{ text: r.system }] },
    contents: r.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [...imgs(m).map((i) => ({ inlineData: { mimeType: i.mediaType, data: i.data } })), { text: m.content }] })),
    tools: r.tools?.length
      ? [{ functionDeclarations: r.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }]
      : undefined,
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gemini error ${res.status}`)
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return {
    text: parts.map((p) => p.text ?? '').join(''),
    toolCalls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: `g${i}`, name: p.functionCall!.name, input: p.functionCall!.args ?? {} })),
    usage: usageOf('gemini', model, data.usageMetadata?.promptTokenCount ?? 0, data.usageMetadata?.candidatesTokenCount ?? 0),
  }
}

/* ───────── OpenAI (REST) ───────── */

async function callOpenAI(r: AiRequest): Promise<AiResponse> {
  const key = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL
  if (!key || !model) throw new Error('OpenAI is not configured (OPENAI_API_KEY / OPENAI_MODEL).')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: r.system },
        ...r.messages.map((m) =>
          imgs(m).length
            ? { role: m.role, content: [{ type: 'text', text: m.content }, ...imgs(m).map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mediaType};base64,${i.data}` } }))] }
            : { role: m.role, content: m.content },
        ),
      ],
      tools: r.tools?.length ? r.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) : undefined,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`)
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const m = data.choices?.[0]?.message
  const toolCalls: ToolCall[] = []
  for (const c of m?.tool_calls ?? []) {
    try {
      toolCalls.push({ id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments || '{}') })
    } catch {
      /* drop malformed tool call — the client re-validates every input anyway */
    }
  }
  return { text: m?.content ?? '', toolCalls, usage: usageOf('openai', model, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0) }
}

function usageOf(provider: string, model: string, inputTokens: number, outputTokens: number) {
  return { provider, model, inputTokens, outputTokens, estCostUsd: cost(model, inputTokens, outputTokens) }
}

/** Which providers have server keys — lets Settings show real availability. */
function configured() {
  return {
    claude: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    gemini: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL),
    openai: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
  }
}

export default async function handler(req: Req, res: Res) {
  if (req.method === 'GET') return res.status(200).json({ providers: configured() })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // TODO(auth): verify the session and resolve the church here before calling any provider.
  const who = String(req.headers?.['x-forwarded-for'] ?? 'anon')
  if (limited(who)) return res.status(429).json({ error: 'Too many requests — please slow down.' })

  let body: AiRequest
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as AiRequest
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }
  if (!body?.provider || !Array.isArray(body.messages) || typeof body.system !== 'string') {
    return res.status(400).json({ error: 'provider, system and messages are required' })
  }
  if (!configured()[body.provider]) return res.status(503).json({ error: `${body.provider} is not configured on the server` })

  try {
    const out = body.provider === 'claude' ? await callClaude(body) : body.provider === 'gemini' ? await callGemini(body) : await callOpenAI(body)
    return res.status(200).json(out)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'The AI provider is busy — try again shortly.' })
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'AI provider credentials are invalid.' })
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `AI provider error (${err.status ?? 'unknown'})` })
    console.error('[api/ai]', err)
    return res.status(502).json({ error: err instanceof Error ? err.message : 'AI request failed' })
  }
}
