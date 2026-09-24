// Phrases that only appear when a reply is giving investment advice. The
// guardrail checks what users ask; this is the safety net on what the agent
// says (a topic classifier on replies flagged ordinary explanations of RSI).
export const ADVICE_PATTERNS: RegExp[] = [
  /\byou should (buy|sell|hold|invest in|short)\b/i,
  /\bI (recommend|suggest) (buying|selling|holding|shorting|you (buy|sell|hold))\b/i,
  /\b(is|looks like) a (good|great|strong) (buy|sell|investment)\b/i,
  /\b(will|is going to|is guaranteed to|guaranteed to) (rise|go up|fall|go down|double|make (you )?money|be profitable)\b/i,
  /\btarget price\b/i,
];

export function looksLikeAdvice(text: string): boolean {
  return ADVICE_PATTERNS.some((re) => re.test(text));
}
