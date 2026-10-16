/**
 * Rebuilds a website whose dots were lost (e.g. "https://hillsongcom/southafrica/") using the church's own email
 * domain(s): the dot-less host is matched against the domain with its dots removed, then the path is kept.
 *   repairWebsite('https://wwwnycgraceorg/', ['office@nycgrace.org'])  → 'https://www.nycgrace.org/'
 *   repairWebsite('https://hillsongcom/southafrica/', ['info@hillsong.co.za', 'x@hillsong.com'])  → 'https://hillsong.com/southafrica/'
 * A website that already has a dot is returned unchanged; '' when it can't be repaired.
 */
const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function repairWebsite(raw: string, emails: string[]): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  const m = v.match(/^(https?:\/\/)?([^/?#\s]+)(.*)$/i)
  if (!m) return ''
  const [, , host, rest] = m
  if (host.includes('.')) return /^https?:\/\//i.test(v) ? v : `https://${v}`
  const flat = strip(host)
  const www = flat.startsWith('www')
  const domains = [...new Set(emails.map((e) => e.split('@')[1]?.toLowerCase().trim() ?? '').filter((d) => d.includes('.')))]
  // Same organisation: also try the domain's main part with common endings (hillsong.co.za → hillsong.com).
  const variants = new Set<string>()
  for (const d of domains) {
    variants.add(d)
    const base = d.split('.')[0]
    for (const tld of ['com', 'org', 'net', 'church', 'org.uk', 'co.uk', 'co.za', 'org.za', 'ie', 'ng', 'org.ng', 'com.ng', 'gh', 'ke', 'ca', 'com.au', 'org.au', 'online', 'info', 'live', 'tv', 'co', 'io', 'us', 'me', 'global', 'world', 'life', 'faith', 'ministries', 'cc', 'net.ng', 'org.gh', 'co.ke']) variants.add(`${base}.${tld}`)
  }
  for (const d of variants) {
    if (flat === strip(d) || flat === `www${strip(d)}`) return `https://${www ? 'www.' : ''}${d}${rest || '/'}`
  }
  return ''
}
