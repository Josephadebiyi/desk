import type { Role } from '../dashboard/types'

/** The specialised capabilities behind Church AI. Users never pick one — the orchestrator does. */
export type AgentId =
  | 'admin' | 'memberCare' | 'followUp' | 'comms' | 'designer' | 'media' | 'finance' | 'attendance'
  | 'events' | 'departments' | 'branches' | 'reporting' | 'knowledge' | 'publicPage' | 'repurposing' | 'automation'

export const AGENTS: Record<AgentId, { name: string }> = {
  admin: { name: 'Church Administrator' },
  memberCare: { name: 'Member Care' },
  followUp: { name: 'Follow-Up' },
  comms: { name: 'Communications' },
  designer: { name: 'Designer' },
  media: { name: 'Media & Sermons' },
  finance: { name: 'Finance' },
  attendance: { name: 'Attendance' },
  events: { name: 'Events & Meetings' },
  departments: { name: 'Departments & Workforce' },
  branches: { name: 'Branch Intelligence' },
  reporting: { name: 'Reporting' },
  knowledge: { name: 'Church Knowledge' },
  publicPage: { name: 'Public Church Page' },
  repurposing: { name: 'Content Repurposing' },
  automation: { name: 'Automation' },
}

/** read/draft run immediately; everything else waits for an explicit human confirmation. */
export type ActionKind = 'read' | 'draft' | 'write' | 'sensitive' | 'financial' | 'delete' | 'bulk' | 'publish'
export const needsConfirmation = (k: ActionKind) => k !== 'read' && k !== 'draft'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'stats'; items: { label: string; value: string }[] }
  | { type: 'list'; items: { title: string; sub?: string; href?: string }[]; more?: number }
  | { type: 'draft'; text: string; channel?: string; href?: string; state?: unknown }
  | { type: 'actions'; items: { label: string; href: string; state?: unknown }[] }
  | { type: 'download'; label: string; filename: string; rows: (string | number)[][] }
  | { type: 'confirm'; id: string; title: string; rows: { label: string; value: string }[]; confirmLabel: string }
  | { type: 'notice'; text: string }

export interface ToolResult {
  agent: AgentId
  blocks: Block[]
  /** A prepared action that runs only after the user confirms. */
  pending?: PendingAction
  /** Short line for the activity log. */
  activity?: string
  entity?: string
}

export interface PendingAction {
  id: string
  agent: AgentId
  kind: ActionKind
  summary: string
  entity?: string
  run: () => ToolResult
}

export interface ToolDef<I = Record<string, unknown>> {
  name: string
  agent: AgentId
  kind: ActionKind
  description: string
  /** JSON Schema for language-model function calling. */
  schema: Record<string, unknown>
  allow: (role: Role) => boolean
  validate: (raw: Record<string, unknown>) => I | string
  run: (ctx: import('./tools').ToolContext, input: I) => ToolResult
}

export type UsageFeature = 'requests' | 'designs' | 'imageEdits' | 'transcriptionHours' | 'clips' | 'storageGb'
export const USAGE_LABEL: Record<UsageFeature, string> = {
  requests: 'AI requests',
  designs: 'Designs',
  imageEdits: 'Image edits',
  transcriptionHours: 'Sermon processing (hours)',
  clips: 'Clips',
  storageGb: 'Storage (GB)',
}

export type ProviderId = 'local' | 'claude' | 'gemini' | 'openai'
export type ProviderPref = 'auto' | ProviderId
