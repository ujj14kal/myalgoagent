export interface PasswordCheck {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

export function checkPassword(password: string): PasswordCheck {
  return {
    minLength: password.length >= 10,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const c = checkPassword(password);
  return c.minLength && c.hasUpper && c.hasLower && c.hasNumber && c.hasSymbol;
}

/** 0-4 strength score, hand-rolled (length + character-class variety) — no heavy zxcvbn dependency. */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: "" };
  const c = checkPassword(password);
  const classes = [c.hasUpper, c.hasLower, c.hasNumber, c.hasSymbol].filter(Boolean).length;
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (password.length >= 8) score = 1;
  if (password.length >= 10 && classes >= 2) score = 2;
  if (password.length >= 10 && classes >= 3) score = 3;
  if (password.length >= 12 && classes >= 4) score = 4;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] };
}
