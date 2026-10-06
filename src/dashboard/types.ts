export const STAGES = ['Newcomer', 'Convert', 'Member', 'Worker'] as const
export type Stage = (typeof STAGES)[number]

export const STATUSES = ['Active', 'Inactive', 'Transferred'] as const
export type MembershipStatus = (typeof STATUSES)[number]

export const GENDERS = ['Female', 'Male'] as const
export type Gender = (typeof GENDERS)[number] | ''

export const CHANNELS = ['Call', 'SMS', 'WhatsApp', 'Email', 'Visit', 'Note'] as const
export type Channel = (typeof CHANNELS)[number]

export interface Communication {
  id: string
  date: string // ISO date
  channel: Channel
  summary: string
  by: string
}

export interface Gift {
  id: string
  date: string
  amount: number
  fund: string // Tithe, Offering, Building, Missions…
  method: string // Cash, Transfer, Card…
}

import type { Lang } from '../i18n'

export interface Member {
  id: string
  fullName: string
  phone: string
  whatsapp: string
  email: string
  gender: Gender
  dob: string // yyyy-mm-dd
  address: string
  branch: string
  department: string
  membershipStatus: MembershipStatus
  dateJoined: string // yyyy-mm-dd
  stage: Stage
  notes: string
  /** Preferred communication language for emails, SMS, WhatsApp and invitations. */
  language: Lang
  communications: Communication[]
  giving: Gift[]
}

export type MemberInput = Omit<Member, 'id' | 'communications' | 'giving'>

/** branch = a branch leader: only sends their own branch's monthly report. */
export type Role = 'admin' | 'finance' | 'leader' | 'branch'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  finance: 'Finance',
  leader: 'Ministry leader',
  branch: 'Branch leader',
}

export const can = {
  viewGiving: (r: Role) => r === 'admin' || r === 'finance',
  editMembers: (r: Role) => r === 'admin' || r === 'leader',
  deleteMembers: (r: Role) => r === 'admin',
  importExport: (r: Role) => r === 'admin',
  /** HQ side of branch reports (see every branch, review, remind). */
  viewBranchReports: (r: Role) => r === 'admin' || r === 'finance',
}

/** Random id (UUID, so it is also a valid database primary key). */
export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?'
