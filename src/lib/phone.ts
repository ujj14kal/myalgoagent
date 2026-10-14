// Mobile numbers: stored as +91XXXXXXXXXX for Indian numbers, or +<country code><digits> for others. Typed with spaces,
// dashes, a leading 0 or 91 and so on, all of that is read and tidied. Not verified by an SMS code (yet): it is for support.

/** The number in storage form, or null when it isn't a mobile number. */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || !/^\+?[0-9 ()-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    if (digits.startsWith("91")) return /^[6-9][0-9]{9}$/.test(digits.slice(2)) ? `+${digits}` : null;
    return digits.length >= 8 && digits.length <= 14 ? `+${digits}` : null;
  }
  let d = digits;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9][0-9]{9}$/.test(d) ? `+91${d}` : null;
}

export const PHONE_ERROR = "Enter a valid mobile number, for example 98765 43210 (Indian numbers) or +44 7911 123456.";
