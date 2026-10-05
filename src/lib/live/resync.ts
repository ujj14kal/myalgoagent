import { entrySlice, lockFloor, targetPrice, targetsTakenFor } from "@/lib/trading-engine/step";
import type { PaperSessionState } from "@/lib/paper/sync";

/**
 * Staged targets only: line the engine's position up with what the broker really holds after a refused or lost
 * target sale. The targets taken are the ones whose combined shares are already sold, and the stop they set follows
 * the last of them — so a resumed strategy never re-sells a target or forgets one.
 */
export function resyncStaged(state: PaperSessionState, realQty: number): PaperSessionState {
  const targets = state.riskManagement?.targets;
  if (!targets?.length || !state.positionEntryPrice || state.positionQuantity == null || realQty <= 0) return state;
  const initial = state.positionInitialQuantity ?? state.positionQuantity;
  const taken = targetsTakenFor(targets, initial, realQty);
  if (taken === (state.positionTargetsHit ?? 0) && realQty === state.positionQuantity) return state;
  let lock: number | null = null;
  if (taken > 0) {
    const level = targets[taken - 1];
    const tp = targetPrice(level, state.positionEntryPrice, undefined, state.direction);
    if (tp !== null) lock = lockFloor(level, tp, state.positionEntryPrice, undefined, state.direction);
  }
  return { ...state, positionQuantity: realQty, positionTargetsHit: taken, positionLockedStopPrice: lock } as PaperSessionState;
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
    positionQuantity: real.qty,
    positionEntryPrice: real.avg ?? state.positionEntryPrice,
    ...(state.positionInitialQuantity != null ? { positionInitialQuantity: real.qty } : {}),
  } as PaperSessionState;
}
