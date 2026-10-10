/** Flyer style library: tags staff give each reference design, and the words that make Ellen pick it automatically. */
export const STYLE_TAGS: Record<string, string[]> = {
  worship: ['worship', 'praise', 'night of', 'adoration', 'music', 'choir', 'concert', 'hymn'],
  youth: ['youth', 'teen', 'young', 'campus', 'students', 'hangout', 'genz', 'gen z'],
  conference: ['conference', 'summit', 'convention', 'seminar', 'workshop', 'retreat', 'camp meeting', 'leadership'],
  prayer: ['prayer', 'fasting', 'vigil', 'intercession', 'night watch', 'devotion', 'revival'],
  crusade: ['crusade', 'outreach', 'evangelism', 'miracle', 'healing', 'gospel'],
  sunday: ['sunday', 'service', 'midweek', 'bible study', 'communion', 'special service'],
  thanksgiving: ['thanksgiving', 'harvest', 'anniversary', 'celebration', 'birthday'],
  christmas: ['christmas', 'carol', 'nativity', 'advent', 'xmas'],
  easter: ['easter', 'resurrection', 'good friday', 'palm sunday', 'passion'],
  newyear: ['new year', 'crossover', 'watch night', 'cross over'],
  women: ['women', 'ladies', 'mothers', 'sisters', 'daughters'],
  men: ['men', 'brothers', 'fathers'],
  children: ['children', 'kids', 'sunday school', 'vbs', 'vacation bible'],
  wedding: ['wedding', 'marriage', 'couples', 'singles'],
  memorial: ['funeral', 'memorial', 'burial', 'celebration of life'],
  general: [],
}
export const STYLE_TAG_KEYS = Object.keys(STYLE_TAGS)

/** Tags whose words appear in the event title / brief. */
export function tagsFor(text: string): string[] {
  const t = ` ${text.toLowerCase()} `
  return STYLE_TAG_KEYS.filter((k) => STYLE_TAGS[k].some((w) => t.includes(w)))
}
