import { BROKERS } from "./catalog";

// The broker wording used on the public pages, built from the same catalog the app uses, so the count and the names
// can never fall behind what actually connects.

const live = BROKERS.filter((b) => b.availability === "live");
const proven = live.filter((b) => !b.beta).map((b) => b.name);
const beta = live.filter((b) => b.beta).map((b) => b.name);
const next = BROKERS.filter((b) => b.availability === "next").map((b) => b.name);

const join = (names: string[], last = "and") => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ${last} ${names[names.length - 1]}`);

export const BROKER_COUNT = live.length;
/** "Dhan, Zerodha, … and Alice Blue" — the brokers that are fully proven. */
export const PROVEN_BROKERS = join(proven);
/** "HDFC Securities (HDFC Sky), Motilal Oswal, … and INDstocks (INDmoney)" — connectable but still marked Beta. */
export const BETA_BROKERS = join(beta);
/** One sentence naming every broker that connects today. */
export const ALL_BROKERS_SENTENCE = `${PROVEN_BROKERS}, plus ${BETA_BROKERS} in beta`;
export const NEXT_BROKERS = join(next);
