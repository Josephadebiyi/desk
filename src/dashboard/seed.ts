import type { Member, Stage } from './types'

/** Deterministic demo data so the trial dashboard isn't empty. */
export const BRANCHES = ['Main Campus', 'Lekki Branch', 'Downtown', 'Online']
export const DEPARTMENTS = ['Worship', 'Ushering', 'Media', 'Children', 'Youth', 'Prayer', 'Welcome', 'Finance', 'Outreach']
export const FUNDS = ['Tithe', 'Offering', 'Building Fund', 'Missions']

const FIRST = ['Grace', 'John', 'Sarah', 'Michael', 'Mary', 'David', 'Esther', 'Samuel', 'Ruth', 'Daniel', 'Joy', 'Peter', 'Faith', 'Emmanuel', 'Deborah', 'Joseph', 'Blessing', 'Paul', 'Hannah', 'Victor', 'Lydia', 'James', 'Mercy', 'Stephen', 'Naomi', 'Andrew', 'Comfort', 'Philip']
const LAST = ['Okafor', 'Smith', 'Collins', 'Adeyemi', 'Johnson', 'Mensah', 'Williams', 'Obi', 'Brown', 'Kalu', 'Davis', 'Eze', 'Thompson', 'Bello']
const STREETS = ['Admiralty Way', 'Allen Avenue', 'Main Street', 'Church Road', 'Park Lane', 'Unity Close', 'Bishop Street']

let s = 7
const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
const pad = (n: number) => String(n).padStart(2, '0')

/** A date `n` months before today (days stay within the elapsed part of the current month). */
function monthsAgo(n: number, r: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1)
  const maxDay = n === 0 ? Math.max(1, now.getDate()) : 27
  d.setDate(1 + Math.floor(r * maxDay))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function seedMembers(): Member[] {
  s = 7
  const out: Member[] = []
  for (let i = 0; i < 48; i++) {
    const first = FIRST[i % FIRST.length]
    const last = pick(LAST)
    const female = ['Grace', 'Sarah', 'Mary', 'Esther', 'Ruth', 'Joy', 'Faith', 'Deborah', 'Blessing', 'Hannah', 'Lydia', 'Mercy', 'Naomi', 'Comfort'].includes(first)
    const stage: Stage = i < 7 ? 'Newcomer' : i < 13 ? 'Convert' : i < 36 ? 'Member' : 'Worker'
    const joined = stage === 'Newcomer' ? monthsAgo(Math.floor(rnd() * 2), rnd()) : monthsAgo(3 + Math.floor(rnd() * 60), rnd())
    const phone = `+234 80${Math.floor(rnd() * 9)} ${100 + Math.floor(rnd() * 899)} ${1000 + Math.floor(rnd() * 8999)}`
    const id = `m${i + 1}`
    const giving =
      stage === 'Newcomer'
        ? []
        : Array.from({ length: 2 + Math.floor(rnd() * 5) }, (_, k) => ({
            id: `${id}g${k}`,
            date: monthsAgo(k, rnd()),
            amount: Math.round((20 + rnd() * 480) / 5) * 5,
            fund: pick(FUNDS),
            method: pick(['Transfer', 'Card', 'Cash']),
          }))
    out.push({
      id,
      fullName: `${first} ${last}`,
      phone,
      whatsapp: rnd() > 0.25 ? phone : '',
      email: `${first}.${last}${i}@example.com`.toLowerCase(),
      gender: female ? 'Female' : 'Male',
      dob: `${1960 + Math.floor(rnd() * 45)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 27))}`,
      address: `${1 + Math.floor(rnd() * 120)} ${pick(STREETS)}`,
      branch: pick(BRANCHES),
      department: stage === 'Newcomer' ? '' : pick(DEPARTMENTS),
      membershipStatus: rnd() > 0.88 ? 'Inactive' : rnd() > 0.95 ? 'Transferred' : 'Active',
      dateJoined: joined,
      stage,
      notes: stage === 'Newcomer' ? 'First visit — invited by a friend. Interested in the youth ministry.' : '',
      language: i % 9 === 4 ? 'fr' : i % 11 === 6 ? 'es' : i % 13 === 8 ? 'pt' : i % 17 === 3 ? 'de' : 'en',
      communications:
        stage === 'Newcomer'
          ? [{ id: `${id}c0`, date: '2026-09-28', channel: 'Call', summary: 'Welcome call after first visit.', by: 'Welcome Team' }]
          : [
              { id: `${id}c0`, date: '2026-09-14', channel: 'SMS', summary: 'Sunday service reminder.', by: 'Admin' },
              { id: `${id}c1`, date: '2026-08-02', channel: 'WhatsApp', summary: 'Department meeting update.', by: 'Pastor Mike' },
            ],
      giving,
    })
  }
  return out
}
