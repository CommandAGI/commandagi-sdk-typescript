/**
 * A FACT THE FILE DOES NOT KNOW, OR KNOWS ONLY ABOUT. Any attribute of a company, a brand and their children may hold,
 * instead of its value, one of two plain objects:
 *
 *   formed={{ unknown: "whether Exocortex Labs is a legal entity at all is open: the owner's answer settles it" }}
 *   transferLock={{ about: "2026-12-30" }}
 *
 * `unknown` says the fact exists and its value is not known, and why (what is open, what would settle it). It is not
 * an absent attribute: absent means the file says nothing. A required attribute may be unknown. `about` gives a value
 * the file knows only roughly (an estimate, a day the owner remembers); the value is of the attribute's own kind.
 * A reader shows each as it is written ("unknown: …", "about 2026-12-30") and lists every unknown as an open fact
 * (CommandAGI's `packages/domain/world/facts.js`); it never puts a default or a placeholder code (`XX`) in its place.
 * The same objects in the Python SDK (`commandagi.design.facts`) and the Rust SDK (`commandagi::design::facts`).
 */
export interface Unknown {
  unknown: string;
}
export interface About<T = unknown> {
  about: T;
}

const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** Whether `v` is an unknown fact: `{ unknown: "<why>" }`, its reason given. */
export const isUnknown = (v: unknown): v is Unknown =>
  plainObject(v) && Object.keys(v).length === 1 && typeof v.unknown === "string" && v.unknown.trim() !== "";
/** Whether `v` is an approximate fact: `{ about: <value> }`. */
export const isAbout = (v: unknown): v is About => plainObject(v) && Object.keys(v).length === 1 && "about" in v && v.about !== null && v.about !== undefined;

/**
 * `v` as a fact marker, or null when it is a plain value. A malformed marker is refused by name (an unknown that
 * gives no reason; an object that mixes `unknown` or `about` with other keys); `check` holds an `about`'s value to
 * the attribute's own kind.
 */
export function factMarker(v: unknown, what: string, check: (value: unknown) => unknown = (x) => x): Unknown | About | null {
  if (!plainObject(v) || !("unknown" in v || "about" in v)) return null;
  if (isUnknown(v)) return { unknown: v.unknown.trim() };
  if (isAbout(v)) return { about: check(v.about) };
  throw new Error(`${what}: an unknown fact is { unknown: "<why>" } and an approximate one { about: <value> }, each alone, not ${JSON.stringify(v)}`);
}
