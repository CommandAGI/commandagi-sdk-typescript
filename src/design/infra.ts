/**
 * INFRASTRUCTURE IN JSX — an account's own machines declared as code (docs/vpn.md § exits as code, in the CommandAGI
 * repository). One folder is one machine: `infra/vpn/<name>/exit.tsx` declares one VPN exit, as `world.tsx` declares
 * one world. A provider's machines share a component (`infra/vpn/hetzner.tsx`), so one folder is one line:
 *
 *   // infra/vpn/hetzner.tsx
 *   export const HetznerExit = ({ name, region, country, continent, size = "cax11", enabled = true }) => (
 *     <exit name={name} provider="hetzner" region={region} country={country} continent={continent}
 *           size={size} image="debian-12" protocol="wireguard" enabled={enabled} />
 *   );
 *
 *   // infra/vpn/fsn-1/exit.tsx
 *   import { HetznerExit } from "../hetzner.tsx";
 *   export default () => <HetznerExit name="fsn-1" region="fsn1" country="DE" continent="EU" />;
 *
 * The file declares; the reconciler (`make infra-plan`, `make infra-apply`) compares it with what the provider runs.
 * Applying is the act that spends money, and it is a person's act at a terminal.
 *
 * Nothing adds a default: what the file does not say, the document does not have. `exitWithDefaults` fills it as the
 * reconciler reads it (`protocol: "wireguard"`, `enabled: true`, `price` and `maxMonthlyUsd` null).
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const EXIT_FIELDS = ["name", "provider", "region", "country", "continent", "size", "image", "protocol", "enabled", "price", "maxMonthlyUsd"] as const;
/** The providers the reconciler can drive. */
export const INFRA_PROVIDERS = ["hetzner", "vultr"] as const;
export const EXIT_PROTOCOLS = ["wireguard"] as const;
export const CONTINENTS = ["AF", "AN", "AS", "EU", "NA", "OC", "SA"] as const;

/** One VPN exit: a machine at a provider that carries the overlay's traffic out (docs/vpn.md § exit nodes). */
export interface ExitDoc {
  /** The exit's node name in the overlay (`fsn-1`); also the server's name at the provider. */
  name: string;
  provider: (typeof INFRA_PROVIDERS)[number];
  /** The provider's location id (`fsn1`, `ash`, `nrt`). */
  region: string;
  /** ISO 3166 alpha-2 of the region (what `via="vpn" exit="DE"` names). */
  country: string;
  continent?: (typeof CONTINENTS)[number];
  /** The provider's server type or plan (`cax11`, `vc2-1c-1gb`). */
  size: string;
  /** The operating system image (`debian-12`). */
  image: string;
  protocol?: (typeof EXIT_PROTOCOLS)[number];
  /** false: declared, never created; an existing one is destroyed. */
  enabled?: boolean;
  /** The exit's row in the pass-through price catalog (`hetzner/exit-egress-falkenstein`). */
  price?: string;
  /**
   * The most the server may cost a month, in USD, from the provider's published price list (the exit's README cites
   * it). Apply refuses a server whose live price is higher, and asks the person to confirm the total.
   */
  maxMonthlyUsd?: number;
}

const NAME = /^[a-z0-9][a-z0-9-]{0,47}$/;
const COUNTRY = /^[A-Z]{2}$/;

function where(t: DocTree): string {
  return `<${t.tag}${typeof t.attrs.name === "string" ? ` name="${t.attrs.name as string}"` : ""}>`;
}

function word(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && (typeof v !== "string" || !v)) throw new Error(`${where(t)} ${k} is a word, not ${JSON.stringify(v)}`);
}
function oneOf(t: DocTree, k: string, values: readonly string[]): void {
  const v = t.attrs[k];
  if (v !== undefined && !values.includes(v as string)) throw new Error(`${where(t)} ${k} is ${values.map((x) => `"${x}"`).join(", ")}, not ${JSON.stringify(v)}`);
}

function said(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EXIT_FIELDS) if (attrs[k] !== undefined) out[k] = attrs[k];
  return out;
}

export const exitVocabulary: Vocabulary<ExitDoc> = {
  format: "exit",
  noun: "a VPN exit",
  root: "exit",
  tags: {
    exit: { parents: [], required: ["name", "provider", "region", "country", "size", "image"], attrs: EXIT_FIELDS },
  },
  fromTree(t) {
    for (const k of ["name", "region", "size", "image", "price"]) word(t, k);
    if (!NAME.test(t.attrs.name as string)) throw new Error(`${where(t)} name is lower-case letters, digits and -, at most 48`);
    oneOf(t, "provider", INFRA_PROVIDERS);
    oneOf(t, "protocol", EXIT_PROTOCOLS);
    oneOf(t, "continent", CONTINENTS);
    if (!COUNTRY.test(String(t.attrs.country))) throw new Error(`${where(t)} country is an ISO 3166 code in capitals ("DE"), not ${JSON.stringify(t.attrs.country)}`);
    if (t.attrs.enabled !== undefined && typeof t.attrs.enabled !== "boolean") throw new Error(`${where(t)} enabled is true or false, not ${JSON.stringify(t.attrs.enabled)}`);
    const max = t.attrs.maxMonthlyUsd;
    if (max !== undefined && !(typeof max === "number" && Number.isFinite(max) && max > 0)) throw new Error(`${where(t)} maxMonthlyUsd is a price in USD (6.99), not ${JSON.stringify(max)}`);
    if (t.children.length) throw new Error(`${where(t)} has no children`);
    return said(t.attrs) as unknown as ExitDoc;
  },
  toTree(d) {
    const attrs: Record<string, unknown> = {};
    for (const k of EXIT_FIELDS) {
      const v = (d as unknown as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && v !== "") attrs[k] = v;
    }
    return { tag: "exit", attrs, children: [] };
  },
};

registerVocabulary(exitVocabulary);

/**
 * VANTAGES — `infra/vantages/<name>/vantage.tsx` (docs/mirrors.md § 2): an observer of the account. A monitor's source
 * names one (`<source vantage="../../infra/vantages/fsn-1">`) and every record it reads says it observed from there.
 *
 *   <vantage name="fsn-1" path="worker" exit="fsn-1" location={{ city: "Falkenstein", region: "DE-SN", country: "DE" }}
 *            locale="de-DE" timezone="Europe/Berlin" />
 *
 * A vantage is a device, a place and a session: a real machine or VM of the account, a declared place, a declared
 * logged-out or logged-in state. It is never a fake person, so the vocabulary has no words for one: no display name,
 * birthday, gender, profile, persona or history. `name` is the folder's word, not a person's name. A field the
 * vocabulary does not list is refused by name.
 */
export const VANTAGE_FIELDS = ["name", "path", "host", "unit", "snapshot", "exit", "location", "locale", "timezone", "session", "device", "clock", "enabled"] as const;
/** Where a vantage observes from: a browser, a VM, an Android VM, a phone, the api worker, or a host. */
export const VANTAGE_PATHS = ["browser", "vm", "android-vm", "phone", "worker", "host"] as const;
export const LOCATION_FIELDS = ["city", "region", "country", "zip", "lat", "lon", "precision"] as const;
/** How exactly a vantage's location is known: from a point to a whole country. */
export const LOCATION_PRECISIONS = ["point", "zip", "city", "region", "country"] as const;
export const DEVICE_FIELDS = ["kind", "os", "browser", "model", "carrier"] as const;

export interface VantageDoc {
  name: string;
  path: (typeof VANTAGE_PATHS)[number];
  /** The host that drives it (its name), for every path but `worker`. */
  host?: string;
  /** The unit it is, in a world (`../../../worlds/fleet/world.tsx#android-01`), for a phone. */
  unit?: string;
  /** The snapshot a VM starts from. */
  snapshot?: string;
  /** A VPN exit's name or country it reads through; absent: the path's own network. */
  exit?: string;
  location?: { city?: string; region?: string; country?: string; zip?: string; lat?: number; lon?: number; precision?: (typeof LOCATION_PRECISIONS)[number] };
  locale?: string;
  timezone?: string;
  /** A ref to the session it reads in (`../../sessions/<name>`): logged out, or logged in as the account. */
  session?: string;
  device?: { kind?: string; os?: string; browser?: string; model?: string; carrier?: string };
  /** The observer's clock: one standard uncertainty in ms of the times it records. */
  clock?: { sd: number };
  /** false: declared and not used (a phone not yet commissioned). */
  enabled?: boolean;
}

const EXIT_REF = /^([A-Z]{2}|[a-z0-9][a-z0-9-]{2,47})$/;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const TIMEZONE = /^[A-Za-z]+(\/[A-Za-z0-9_+-]+)*$/;

function onlyKeys(t: DocTree, k: string, allowed: readonly string[]): Record<string, unknown> | undefined {
  const v = t.attrs[k];
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${where(t)} ${k} is an object, not ${JSON.stringify(v)}`);
  for (const key of Object.keys(v)) if (!allowed.includes(key)) throw new Error(`${where(t)} ${k}.${key} is not read (${k} has ${allowed.join(", ")}; a vantage has no fields for a person)`);
  return v as Record<string, unknown>;
}

export const vantageVocabulary: Vocabulary<VantageDoc> = {
  format: "vantage",
  noun: "a vantage",
  root: "vantage",
  tags: {
    vantage: { parents: [], required: ["name", "path"], attrs: VANTAGE_FIELDS },
  },
  fromTree(t) {
    for (const k of ["name", "host", "unit", "snapshot", "exit", "locale", "timezone", "session"]) word(t, k);
    if (!NAME.test(t.attrs.name as string)) throw new Error(`${where(t)} name is the folder's word: lower-case letters, digits and -, at most 48`);
    oneOf(t, "path", VANTAGE_PATHS);
    const path = t.attrs.path as string;
    if (path !== "worker" && path !== "host" && t.attrs.host === undefined) throw new Error(`${where(t)} a ${path} is driven by a host: name it (host="laptop-linux")`);
    if (path === "worker" && t.attrs.host !== undefined) throw new Error(`${where(t)} the worker's path has no host`);
    if (t.attrs.unit !== undefined && path !== "phone") throw new Error(`${where(t)} unit names a phone's unit in a world, for path="phone" only`);
    if (t.attrs.snapshot !== undefined && path !== "vm" && path !== "android-vm") throw new Error(`${where(t)} snapshot is for a VM`);
    if (t.attrs.exit !== undefined && !EXIT_REF.test(t.attrs.exit as string)) throw new Error(`${where(t)} exit is an exit's name (fsn-1) or a country (DE), not ${JSON.stringify(t.attrs.exit)}`);
    if (t.attrs.locale !== undefined && !LOCALE.test(t.attrs.locale as string)) throw new Error(`${where(t)} locale is a BCP 47 tag (en-US), not ${JSON.stringify(t.attrs.locale)}`);
    if (t.attrs.timezone !== undefined && !TIMEZONE.test(t.attrs.timezone as string)) throw new Error(`${where(t)} timezone is an IANA zone (America/Chicago), not ${JSON.stringify(t.attrs.timezone)}`);
    const loc = onlyKeys(t, "location", LOCATION_FIELDS);
    if (loc) {
      if (loc.country !== undefined && !COUNTRY.test(String(loc.country))) throw new Error(`${where(t)} location.country is an ISO 3166 code in capitals (US)`);
      for (const [k, lo, hi] of [["lat", -90, 90], ["lon", -180, 180]] as const)
        if (loc[k] !== undefined && !(typeof loc[k] === "number" && (loc[k] as number) >= lo && (loc[k] as number) <= hi)) throw new Error(`${where(t)} location.${k} is a number from ${lo} to ${hi}`);
      if (loc.precision !== undefined && !LOCATION_PRECISIONS.includes(loc.precision as never)) throw new Error(`${where(t)} location.precision is ${LOCATION_PRECISIONS.join(", ")}`);
      for (const k of ["city", "region", "zip"]) if (loc[k] !== undefined && (typeof loc[k] !== "string" || !loc[k])) throw new Error(`${where(t)} location.${k} is a word`);
    }
    const device = onlyKeys(t, "device", DEVICE_FIELDS);
    if (device) for (const [k, v] of Object.entries(device)) if (typeof v !== "string" || !v) throw new Error(`${where(t)} device.${k} is a word`);
    const clock = t.attrs.clock as { sd?: unknown } | undefined;
    if (clock !== undefined && !(clock && typeof clock === "object" && Object.keys(clock).join() === "sd" && typeof clock.sd === "number" && clock.sd >= 0))
      throw new Error(`${where(t)} clock is { sd } in ms (the observer's clock: NTP is tens of ms)`);
    if (t.attrs.enabled !== undefined && typeof t.attrs.enabled !== "boolean") throw new Error(`${where(t)} enabled is true or false, not ${JSON.stringify(t.attrs.enabled)}`);
    if (t.children.length) throw new Error(`${where(t)} has no children`);
    const out: Record<string, unknown> = {};
    for (const k of VANTAGE_FIELDS) if (t.attrs[k] !== undefined) out[k] = t.attrs[k];
    return out as unknown as VantageDoc;
  },
  toTree(d) {
    const attrs: Record<string, unknown> = {};
    for (const k of VANTAGE_FIELDS) {
      const v = (d as unknown as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && v !== "") attrs[k] = v;
    }
    return { tag: "vantage", attrs, children: [] };
  },
};

registerVocabulary(vantageVocabulary);


/** A vantage as the platform reads it: what the file does not say, filled (`enabled: true`, the rest null). */
export function vantageWithDefaults(d: VantageDoc) {
  return {
    name: d.name,
    path: d.path,
    host: d.host ?? null,
    unit: d.unit ?? null,
    snapshot: d.snapshot ?? null,
    exit: d.exit ?? null,
    location: d.location ?? null,
    locale: d.locale ?? null,
    timezone: d.timezone ?? null,
    session: d.session ?? null,
    device: d.device ?? null,
    clock: d.clock ?? null,
    enabled: d.enabled ?? true,
  };
}

// ── Sessions: logged-in states as declared assets ───────────────────────────────────────────────

/**
 * A logged-in state (docs/monitors.md § approaches): a browser profile on a host, a Linux VM snapshot or an Android VM
 * snapshot, in which a site is signed in (or deliberately not). One folder is one state:
 * `infra/sessions/<name>/session.tsx`. A monitor's source names it by a ref
 * (`session="../../../infra/sessions/x-web/session.tsx"`). The file holds no credential: the state lives in the host's
 * profile store or in the provider's snapshot.
 *
 *   export default () => (
 *     <session name="x-web" site="https://x.com" kind="browser-profile" profile="x-web" refreshed="2026-10-12">
 *       <uses monitor="../../../social/x/nvidia" />
 *     </session>
 *   );
 */
export const SESSION_FIELDS = ["name", "site", "kind", "host", "profile", "snapshot", "refreshed", "note"] as const;
export const SESSION_KINDS = ["browser-profile", "vm-snapshot", "android-snapshot"] as const;
/** The source path (`via`) that reads through each kind of state. */
export const SESSION_VIA = { "browser-profile": "browser", "vm-snapshot": "vm", "android-snapshot": "android-vm" } as const;

export interface SessionDoc {
  name: string;
  /** The site the state is of (`https://x.com`). */
  site: string;
  kind: (typeof SESSION_KINDS)[number];
  /**
   * browser-profile: the host that holds the profile (absent: the account's first online host). vm-snapshot,
   * android-snapshot: the host the snapshot runs when it boots (absent: the snapshot's name).
   */
  host?: string;
  /** browser-profile: the profile's name in the host's profile store (`~/.commandagi/browser-profiles/<profile>/`). */
  profile?: string;
  /** vm-snapshot, android-snapshot: the snapshot's id or name at the provider. */
  snapshot?: string;
  /** The day the state was last signed in again (`YYYY-MM-DD`). */
  refreshed?: string;
  note?: string;
  /** The monitors that read through it: refs to their folders, relative to the session's folder. */
  uses: { monitor: string }[];
}

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const sessionVocabulary: Vocabulary<SessionDoc> = {
  format: "session",
  noun: "a logged-in state",
  root: "session",
  tags: {
    session: { parents: [], required: ["name", "site", "kind"], attrs: SESSION_FIELDS },
    uses: { parents: ["session"], key: "monitor", required: ["monitor"], attrs: ["monitor"] },
  },
  fromTree(t) {
    for (const k of SESSION_FIELDS) word(t, k);
    if (!NAME.test(t.attrs.name as string)) throw new Error(`${where(t)} name is lower-case letters, digits and -, at most 48`);
    if (!/^https:\/\/[^\s/]+(\/\S*)?$/.test(t.attrs.site as string)) throw new Error(`${where(t)} site is an https address ("https://x.com"), not ${JSON.stringify(t.attrs.site)}`);
    oneOf(t, "kind", SESSION_KINDS);
    const browser = t.attrs.kind === "browser-profile";
    if (browser && t.attrs.profile === undefined) throw new Error(`${where(t)} a browser-profile names its profile`);
    if (!browser && t.attrs.snapshot === undefined) throw new Error(`${where(t)} a ${t.attrs.kind as string} names its snapshot`);
    if (browser && t.attrs.snapshot !== undefined) throw new Error(`${where(t)} a browser-profile has a profile, not a snapshot`);
    if (!browser && t.attrs.profile !== undefined) throw new Error(`${where(t)} a ${t.attrs.kind as string} has a snapshot, not a profile`);
    if (t.attrs.profile !== undefined && !NAME.test(t.attrs.profile as string)) throw new Error(`${where(t)} profile is lower-case letters, digits and -, at most 48`);
    if (t.attrs.refreshed !== undefined && !DAY.test(t.attrs.refreshed as string)) throw new Error(`${where(t)} refreshed is a day ("2026-10-12"), not ${JSON.stringify(t.attrs.refreshed)}`);
    const uses = t.children.map((c) => ({ monitor: c.attrs.monitor as string }));
    const out: Record<string, unknown> = {};
    for (const k of SESSION_FIELDS) if (t.attrs[k] !== undefined) out[k] = t.attrs[k];
    return { ...out, uses } as unknown as SessionDoc;
  },
  toTree(d) {
    const attrs: Record<string, unknown> = {};
    for (const k of SESSION_FIELDS) {
      const v = (d as unknown as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && v !== "") attrs[k] = v;
    }
    return { tag: "session", attrs, children: (d.uses ?? []).map((u) => ({ tag: "uses", attrs: { monitor: u.monitor }, children: [] })) };
  },
};

registerVocabulary(sessionVocabulary);

/** A session as a source reads it: what the file does not say, filled. */
export function sessionWithDefaults(d: SessionDoc) {
  return {
    name: d.name,
    site: d.site,
    kind: d.kind,
    host: d.host ?? null,
    profile: d.profile ?? null,
    snapshot: d.snapshot ?? null,
    refreshed: d.refreshed ?? null,
    note: d.note ?? null,
    uses: (d.uses ?? []).map((u) => u.monitor),
  };
}

/** The vocabulary of infrastructure files, by format. */
export const INFRA = { exit: exitVocabulary, session: sessionVocabulary, vantage: vantageVocabulary } as const;

/** An exit as the reconciler reads it: what the file does not say, filled. */
export function exitWithDefaults(d: ExitDoc) {
  return {
    name: d.name,
    provider: d.provider,
    region: d.region,
    country: d.country,
    continent: d.continent ?? null,
    size: d.size,
    image: d.image,
    protocol: d.protocol ?? "wireguard",
    enabled: d.enabled ?? true,
    price: d.price ?? null,
    maxMonthlyUsd: d.maxMonthlyUsd ?? null,
  };
}
