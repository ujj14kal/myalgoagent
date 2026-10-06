import { entrySlice, lockFloor, stopLossDistance, targetPrice, targetsTakenFor, tighterStop, type RiskUnit } from "@/lib/trading-engine/step";
import { engineRisk } from "@/lib/trading-engine/risk-options";
import type { PaperSessionState } from "@/lib/paper/sync";

/**
 * Staged targets only: line the engine's position up with what the broker really holds after a refused or lost
 * target sale. The targets taken are the ones whose combined shares are already sold, and the stop they set follows
 * the last of them — so a resumed strategy never re-sells a target or forgets one.
 */
export function resyncStaged(state: PaperSessionState, realQty: number): PaperSessionState {
  if (!state.riskManagement?.targets?.length || !state.positionEntryPrice || state.positionQuantity == null || realQty <= 0) return state;
  // The targets in price terms, exactly as the engine runs them (margin-based ones converted).
  const rm = state.riskOptions ? engineRisk(state.riskManagement, state.riskOptions).riskManagement : state.riskManagement;
  const targets = rm.targets!;
  const initial = state.positionInitialQuantity ?? state.positionQuantity;
  const taken = targetsTakenFor(targets, initial, realQty);
  if (taken === (state.positionTargetsHit ?? 0) && realQty === state.positionQuantity) return state;
  let lock: number | null = null;
  let trailAfter: { unit: RiskUnit; value: number } | null = null;
  const entry = state.positionEntryPrice;
  const stopDist = stopLossDistance(rm, entry, undefined);
  for (let k = 0; k < taken; k++) {
    // Replay each taken target's stop rule in order, as the engine applied them.
    const level = targets[k];
    const tp = targetPrice(level, entry, undefined, state.direction, stopDist);
    if (tp === null) continue;
    const prev = k > 0 ? targetPrice(targets[k - 1], entry, undefined, state.direction, stopDist) : null;
    lock = tighterStop(lock, lockFloor(level, tp, entry, undefined, state.direction, prev), state.direction);
    if (level.lock.mode === "TRAIL") trailAfter = { unit: level.lock.unit, value: level.lock.value };
  }
  return { ...state, positionQuantity: realQty, positionTargetsHit: taken, positionLockedStopPrice: lock, positionTrailAfter: trailAfter } as PaperSessionState;
}

/**
 * Multi-level entry plan only: line the engine up with what the broker really holds after a refused or lost entry.
 * While no target has been taken nothing has been sold, so the shares held are exactly the shares bought: the entries
 * done are the ones whose combined slices fit within them, and the average price is the broker's own.
 */
export function resyncEntryPlan(state: PaperSessionState, real: { qty: number; avg: number | null }): PaperSessionState {
  const plan = state.entryPlan;
  if (!plan || state.positionEntryPrice == null || state.positionQuantity == null || real.qty <= 0) return state;
  if ((state.positionTargetsHit ?? 0) > 0) return state; // distribution has begun; no further entries
  const planned = state.positionPlannedQuantity ?? state.positionQuantity;
  let cumulative = entrySlice(plan.firstPercent, planned, 0);
  let filled = real.qty >= cumulative ? 1 : 0;
  for (const level of plan.levels) {
    cumulative += entrySlice(level.allocationPercent, planned, cumulative);
    if (real.qty >= cumulative) filled++;
    else break;
  }
  const count = Math.max(1, filled);
  if (count === state.positionPyramidCount && real.qty === state.positionQuantity) return state;
  return {
    ...state,
    positionPyramidCount: count,
    positionLevelCursor: count - 1,
    positionQuantity: real.qty,
    positionEntryPrice: real.avg ?? state.positionEntryPrice,
    ...(state.positionInitialQuantity != null ? { positionInitialQuantity: real.qty } : {}),
  } as PaperSessionState;
}
