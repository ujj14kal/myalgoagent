/** NSE cash session (Mon–Fri 09:15–15:30 IST) plus 15 minutes to pick up the final candle and square-offs. */
export function inMarketWindow(now: Date): boolean {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minute >= 9 * 60 + 15 && minute <= 15 * 60 + 45;
}
