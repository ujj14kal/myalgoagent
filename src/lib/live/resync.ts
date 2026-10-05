import { lockFloor, targetPrice, targetsTakenFor } from "@/lib/trading-engine/step";
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
