// Node's built-in fetch() runs on the copy of undici bundled into the Node
// binary, and it finds its connection pool through a global slot shared with
// the npm `undici` package:
//
//   Symbol.for("undici.globalDispatcher.1") — legacy handler API. Node 22/24's
//     bundled undici reads this one. Any dispatcher works here, since the
//     legacy API is stable across undici versions.
//   Symbol.for("undici.globalDispatcher.2") — the newer handler API. Node 26's
//     bundled undici (8.x) reads this one, and it only works with a
//     dispatcher from the *same* undici build: an npm undici 8.10 Agent hands
//     Node 26's undici 8.0 fetch response headers in a shape it doesn't read,
//     so every header is dropped (no content-encoding, so gzip bodies come back
//     still compressed; no content-type, set-cookie or location either).
//
// The npm package fills the empty slots with its own Agent the moment it's
// imported, so Node's copy has to load first — importing this module does that
// (reading the lazy Response global loads Node's undici, which installs its
// default Agent). Import it before anything that imports npm `undici`.
void globalThis.Response;

const V1 = Symbol.for("undici.globalDispatcher.1");
const V2 = Symbol.for("undici.globalDispatcher.2");

type Slot = typeof globalThis & Record<symbol, { constructor: new (...args: unknown[]) => unknown } | undefined>;
type AgentOptions = { keepAliveTimeout: number; keepAliveMaxTimeout: number };

/** Replace the dispatcher behind the built-in fetch() with one using `opts`, on any Node version. */
export async function setFetchAgentOptions(opts: AgentOptions): Promise<void> {
  const g = globalThis as Slot;
  const { Agent, Dispatcher1Wrapper, setGlobalDispatcher } = await import("undici");
  const current = g[V2];
  if (current && !(current instanceof Agent) && !(current instanceof Dispatcher1Wrapper)) {
    // Node's own undici owns the v2 slot: build the new Agent from its class
    // so the dispatcher and fetch() are always the same undici build.
    const agent = new current.constructor(opts);
    g[V2] = agent as Slot[symbol];
    const legacy = g[V1];
    if (legacy && legacy !== current) g[V1] = new legacy.constructor(agent) as Slot[symbol]; // its v1 wrapper
    return;
  }
  // Older Node: fetch() reads the legacy slot, where the npm Agent is safe.
  setGlobalDispatcher(new Agent(opts));
}
