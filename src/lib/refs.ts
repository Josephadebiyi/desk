/** Short, human-friendly references shown in emails and the app (same everywhere, derived from the record id). */
export const ticketRef = (id: string) => `ZD-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
export const flyerRef = (id: string) => `FLY-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
