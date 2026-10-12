import { AsyncLocalStorage } from "node:async_hooks";

// Which user a broker call is for, so the call can leave through that user's own static-IP relay. Set around the code that
// talks to a user's broker (orders, readiness checks); everything inside inherits it without passing a userId through
// every broker adapter.

export type EgressContext = {
  userId: string;
  /** Order-grade calls must leave from the user's own IP: if a paid user's relay isn't ready the call is refused, never sent from a shared IP. */
  strict: boolean;
};

const store = new AsyncLocalStorage<EgressContext>();
export const currentEgressContext = () => store.getStore();
export function withUserEgress<T>(userId: string, fn: () => Promise<T>, opts: { strict?: boolean } = {}): Promise<T> {
  return store.run({ userId, strict: opts.strict ?? false }, fn);
}

/** Thrown instead of sending an order from the wrong address. */
export class EgressUnavailableError extends Error {
  constructor(message = "Your static IP isn't ready yet, so live orders are paused for your account. It usually takes a couple of minutes; if it stays like this, contact support.") {
    super(message);
    this.name = "EgressUnavailableError";
  }
}
