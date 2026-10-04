import type { ProviderId, ProviderPref } from './types'
import { api } from '../lib/api'

/**
 * AI provider abstraction. Each provider declares what it is good at; AUTO routes a task
 * to the best enabled provider. Remote providers are called through /api/ai so API keys
 * stay on the server. "ZionDesk Local" answers from church data with deterministic rules —
 * always available, free, and works on slow connections.
 */
export type Capability = 'chat' | 'reasoning' | 'vision' | 'image' | 'transcribe' | 'embed' | 'translate'
export type Task = 'answer' | 'write' | 'translate' | 'vision' | 'image' | 'transcribe' | 'search'

export interface ProviderInfo {
  id: ProviderId
  label: string
  capabilities: Capability[]
  remote: boolean
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  local: { id: 'local', label: 'ZionDesk Local', capabilities: ['chat'], remote: false },
  claude: { id: 'claude', label: 'Claude', capabilities: ['chat', 'reasoning', 'vision', 'translate'], remote: true },
  gemini: { id: 'gemini', label: 'Gemini', capabilities: ['chat', 'reasoning', 'vision', 'translate'], remote: true },
  openai: { id: 'openai', label: 'OpenAI', capabilities: ['chat', 'reasoning', 'vision', 'translate'], remote: true },
}

const TASK_NEEDS: Record<Task, Capability> = {
  answer: 'chat',
  write: 'reasoning',
  translate: 'translate',
  vision: 'vision',
  image: 'image',
  transcribe: 'transcribe',
  search: 'embed',
}

/** AUTO preference order per capability (first enabled + available wins). */
const AUTO_ORDER: Record<Capability, ProviderId[]> = {
  chat: ['local', 'claude', 'gemini', 'openai'], // data questions are answered from records first
  reasoning: ['claude', 'gemini', 'openai'],
  translate: ['claude', 'gemini', 'openai'],
  vision: ['claude', 'gemini', 'openai'],
  image: [],
  transcribe: [],
  embed: [],
}

export interface ProviderStatus {
  enabled: Record<Exclude<ProviderId, 'local'>, boolean> // admin switched it on
  available: Record<Exclude<ProviderId, 'local'>, boolean> // server has a key
}

const usable = (id: ProviderId, s: ProviderStatus) => id === 'local' || (s.enabled[id] && s.available[id])

/** Returns the provider to use, or null when no configured provider can do the task. */
export function pickProvider(task: Task, pref: ProviderPref, status: ProviderStatus): ProviderId | null {
  const need = TASK_NEEDS[task]
  if (pref !== 'auto') {
    return usable(pref, status) && PROVIDERS[pref].capabilities.includes(need) ? pref : null
  }
  return AUTO_ORDER[need].find((id) => usable(id, status)) ?? null
}

/** Asks the server which providers have keys. Fails soft (all false) when the API isn't deployed. */
export async function fetchProviderAvailability(): Promise<ProviderStatus['available']> {
  try {
    const res = await fetch('/api/ai')
    if (!res.headers.get('content-type')?.includes('application/json')) throw new Error('not deployed')
    const data = (await res.json()) as { providers?: ProviderStatus['available'] }
    return { claude: !!data.providers?.claude, gemini: !!data.providers?.gemini, openai: !!data.providers?.openai }
  } catch {
    return { claude: false, gemini: false, openai: false }
  }
}

export interface RemoteResult {
  text: string
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[]
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number; estCostUsd: number }
}

export async function remoteComplete(
  provider: Exclude<ProviderId, 'local'>,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string; images?: { mediaType: string; data: string }[] }[],
  tools: { name: string; description: string; input_schema: Record<string, unknown> }[],
): Promise<RemoteResult> {
  // Signed-in session + church are attached so the server can check access and record usage.
  return api<RemoteResult>('/ai', { provider, system, messages, tools })
}
