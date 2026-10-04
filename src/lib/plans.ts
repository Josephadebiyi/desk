/** Plan limits shared by the web app and the API server. */
export type PlanKey = 'essentials' | 'plus' | 'max'

/** AI flyers per calendar month. `null` = unlimited. */
export const AI_FLYER_LIMIT: Record<PlanKey, number | null> = {
  essentials: 7,
  plus: 12,
  max: null,
}

export const flyerLimit = (plan: string): number | null => (plan in AI_FLYER_LIMIT ? AI_FLYER_LIMIT[plan as PlanKey] : AI_FLYER_LIMIT.essentials)

export type FlyerFormat = 'portrait' | 'square' | 'story'
export const FLYER_SIZE: Record<FlyerFormat, { w: number; h: number }> = {
  portrait: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
}
