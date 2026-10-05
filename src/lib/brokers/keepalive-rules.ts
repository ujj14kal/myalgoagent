// The decisions behind broker keep-alive, kept free of the database so they can be tested.

import type { BrokerConnection } from "@prisma/client";

type Row = Pick<BrokerConnection, "broker" | "loginMethod" | "status" | "tokenExpiresAt" | "lastCheckedAt" | "connectedAt" | "lastError">;

/** Renew this long before the session ends, and never try more often than the retry gap. */
export const RENEW_BEFORE_MS = 10 * 60_000;
export const RETRY_GAP_MS = 5 * 60_000;
/** How often a live session is re-checked with the broker while the market is open. */
export const CHECK_EVERY_MS = 15 * 60_000;

/** Only Groww's TOTP key lets us sign in without the account holder; every other broker needs their own daily login. */
export function canRenewUnattended(row: Pick<Row, "broker" | "loginMethod">): boolean {
  return row.broker === "groww" && row.loginMethod === "totp";
}

export function renewalDue(row: Row, now = new Date()): boolean {
  const t = now.getTime();
  const valid = row.status === "CONNECTED" && !!row.tokenExpiresAt && row.tokenExpiresAt.getTime() - t > RENEW_BEFORE_MS;
  if (valid) return false;
  if (row.connectedAt && t - row.connectedAt.getTime() < RETRY_GAP_MS) return false;
  if (row.lastError && row.lastCheckedAt && t - row.lastCheckedAt.getTime() < RETRY_GAP_MS) return false;
  return true;
}

export function checkDue(row: Row, now = new Date()): boolean {
  return !row.lastCheckedAt || now.getTime() - row.lastCheckedAt.getTime() >= CHECK_EVERY_MS;
}

/** Weekdays 08:30–09:15 IST, when this broker has no session today and can't sign in by itself. */
export function needsMorningLogin(row: Row, now = new Date()): boolean {
  if (canRenewUnattended(row)) return false;
  if (row.status === "CONNECTED" && row.tokenExpiresAt && row.tokenExpiresAt.getTime() > now.getTime()) return false;
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = ist.getUTCDay();
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && minute >= 8 * 60 + 30 && minute <= 9 * 60 + 15;
}
