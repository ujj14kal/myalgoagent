// Request-time date helpers for admin pages (kept out of component bodies).
export const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
export const dueWithin = (d: Date, ms: number) => d.getTime() - Date.now() < ms;
