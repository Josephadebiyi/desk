/** Duplicate-member matching (shared by the join form, Add member, import and Members → Duplicates). */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicateGroups, findExisting, sameBirthday } from '../../src/lib/duplicates'

const people = [
  { id: 'a', fullName: 'Grace Okafor', email: 'Grace@Example.com', phone: '+234 803 555 0101', whatsapp: '', dob: '1904-05-12' },
  { id: 'b', fullName: 'John Adeyemi', email: '', phone: '0812 222 3333', whatsapp: '', dob: '' },
  { id: 'c', fullName: 'Mary Bello', email: 'mary@x.org', phone: '', whatsapp: '', dob: '' },
]

test('same email (any case) or same phone (any format) is the same person', () => {
  assert.equal(findExisting({ fullName: 'G. Okafor', email: 'grace@example.com ' }, people)?.reason, 'email')
  assert.equal(findExisting({ fullName: 'Johnny', phone: '+234 812 222 3333' }, people)?.match.id, 'b')
  assert.equal(findExisting({ fullName: 'Someone', whatsapp: '08035550101' }, people)?.match.id, 'a')
})

test('a name alone is only a warning; with the same birthday it is the same person', () => {
  const hit = findExisting({ fullName: '  mary   BELLO ', phone: '0700 000 0000' }, people)
  assert.equal(hit?.reason, 'name')
  assert.ok(!sameBirthday('1904-01-01', hit!.match.dob))
  assert.ok(sameBirthday('1990-05-12', '1904-05-12')) // year ignored
  assert.equal(findExisting({ fullName: 'Peter', phone: '0700 000 0000' }, people), null)
  assert.equal(findExisting({ fullName: 'Grace', email: '' }, people), null) // single names don't match
})

test('duplicate groups across the member list', () => {
  const list = [...people, { id: 'd', fullName: 'Grace  Okafor', email: '', phone: '08035550101', whatsapp: '', dob: '' }, { id: 'e', fullName: 'John Adeyemi', email: 'j@a.com', phone: '', whatsapp: '', dob: '' }]
  const g = duplicateGroups(list)
  assert.equal(g.length, 2)
  const grace = g.find((x) => x.members.some((m) => m.id === 'a'))!
  assert.deepEqual(grace.members.map((m) => m.id).sort(), ['a', 'd'])
  assert.equal(grace.reason, 'phone')
  assert.equal(g.find((x) => x.members.some((m) => m.id === 'b'))!.reason, 'name')
})
