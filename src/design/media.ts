/**
 * A VIDEO OR A SONG IN JSX — the media editors' own documents, declared as the nodes the CommandAGI video editor
 * (`.vid.tsx`: `video.source`, `video.instance`, `video.clip`, `video.track`, `video.composite`) and music studio (`.mus.tsx`: `midiClip`,
 * `instrument`, `fx.*`, `track`, `master`) store and edit. No second model: the editor opens what this declares.
 *
 *   export default () => (
 *     <video name="Balcony" width={1280} height={720} fps={30}>
 *       <track name="V1">
 *         <clip src="media/sky.png" start={0} duration={3} />
 *         <title text="Hello" start={0} duration={2} fontSize={72} />
 *       </track>
 *       <track name="V2">
 *         <composition src="Intro.vid.tsx" start={3} in={0} out={2} />
 *         <artboard src="Poster.draw.tsx" start={5} duration={2} fit="contain" />
 *       </track>
 *       <track name="A1" kind="audio">
 *         <clip src="media/tone.wav" start={0} in={0.5} out={2.5} volume={0.8} />
 *       </track>
 *       <track name="V3">
 *         <clip src="media/take.mp4" link="L1" start={7} in={2} out={4} volume={0} />
 *       </track>
 *       <track name="A2" kind="audio">
 *         <clip src="media/take.mp4" link="L1" start={7} in={2} out={4} />
 *       </track>
 *     </video>
 *   );
 *
 *   export default () => (
 *     <song name="Loop" tempo={120} timeSignature="4/4" bars={8} cycleStart={0} cycleEnd={16}>
 *       <track name="Keys">
 *         <synth wave="triangle" />
 *         <clip name="Keys 1" start={0} length={4}>
 *           <note pitch="C4" start={0} duration={1} velocity={0.8} />
 *         </clip>
 *       </track>
 *       <track name="Tone">
 *         <clip src="media/tone.wav" start={4} length={2} in={0.25} volume={0.8} />
 *       </track>
 *       <track name="Bells">
 *         <sampler src="media/tone.wav" root="A4" />
 *         <clip name="Bells 1" start={0} length={4} />
 *       </track>
 *     </song>
 *   );
 *
 * Media files are named by path relative to the file (`src`), never inlined; the editor reads them. So are a nested
 * composition (`<composition src>`: another video's code, a `video.instance` node whose frames are its clip's source;
 * `inputs` are the values it gives that video's parameters; `artboard` names which of that video's own artboards it
 * shows, else its own frame) and an artboard (`<artboard src>`: a drawing's page, drawn
 * live; `view` names the page, else the first; `crop={{ x, y, width, height }}` the part of it to show; `inputs` are
 * the values it gives the drawing's parameters, so two artboards of one drawing can say two things). A video file
 * on an audio track is its sound.
 *
 * A video's own artboards are other frames of it at other sizes (`<artboard name="Vertical" width={1080} height={1920} />`
 * in the `<video>`, with no `src`; the video itself is the first). A clip, title or effect says what it is on one of them
 * with an `<override artboard="Vertical" …>` inside it: the properties it names replace the clip's own on that artboard
 * only (a title reframed for 9:16, another media file in a `<clip>`, a `<shape>`'s fill, an `<artboard>` clip's drawing
 * `inputs`, an effect's amount), and every other artboard keeps the clip's own. The `<keyframe property>`s inside an
 * `<override>` are that artboard's own keys: there the property follows them, not the clip's. An `<override>` in an
 * `<effect>` holds `<keyframe param>`s the same way, and `noKeys` on either names what has no keys on that artboard
 * (`noKeys={["opacity"]}`: the clip's keys of it do not show there). Two `<clip>`s with the same `link` are one take's picture and sound, edited as a pair
 * (the editor's source patch writes them). Times on a
 * video's timeline are seconds; times in a song are beats (an audio clip's `in`, where it starts in its file, is
 * seconds, as on a video). Each node carries the element that declared it in
 * `meta.source`; what a node holds that is not a node (a clip's effects, audio effects, transition, intro, outro and keyframes; a midi clip's
 * notes; a video's markers) carries its element in `meta.sources`, by key. Anything else is refused by name.
 */
import { slug, Declaration, type IRGraph, type IRNode } from "./ir.js";
import { childElements, type DesignElement } from "./jsx-runtime.js";

/** The root tags a media file declares. */
export const MEDIA_ROOTS: ReadonlySet<string> = new Set(["video", "song"]);

const where = (el: DesignElement) => {
  const n = el.props.name ?? el.props.src ?? el.props.text;
  return `<${el.type}${typeof n === "string" ? ` ${el.props.name !== undefined ? "name" : el.props.src !== undefined ? "src" : "text"}="${n}"` : ""}>`;
};

function refuseUnknown(el: DesignElement, allowed: readonly string[]): void {
  for (const k of Object.keys(el.props)) {
    if (k === "children" || k === "key" || allowed.includes(k)) continue;
    throw new Error(`${where(el)}: prop ${k} is not read on a <${el.type}>`);
  }
}

function num(el: DesignElement, prop: string, opts: { min?: number; max?: number } = {}): number | undefined {
  const v = el.props[prop];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${where(el)}: ${prop} is a number, not ${JSON.stringify(v)}`);
  if (opts.min !== undefined && v < opts.min) throw new Error(`${where(el)}: ${prop} is at least ${opts.min}, not ${v}`);
  if (opts.max !== undefined && v > opts.max) throw new Error(`${where(el)}: ${prop} is at most ${opts.max}, not ${v}`);
  return v;
}

function str(el: DesignElement, prop: string, oneOf?: readonly string[]): string | undefined {
  const v = el.props[prop];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(`${where(el)}: ${prop} is text, not ${JSON.stringify(v)}`);
  if (oneOf && !oneOf.includes(v)) throw new Error(`${where(el)}: ${prop} is one of ${oneOf.join(", ")}, not "${v}"`);
  return v;
}

function bool(el: DesignElement, prop: string): boolean | undefined {
  const v = el.props[prop];
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw new Error(`${where(el)}: ${prop} is true or false, not ${JSON.stringify(v)}`);
  return v;
}

const sourceMeta = (el: DesignElement) => (el.source === undefined ? undefined : el.source);
/** A node's meta: the element it came from, and the elements of what it holds, by key. */
function metaOf(el: DesignElement, sources: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const meta: Record<string, unknown> = { ...extra };
  const at = sourceMeta(el);
  if (at !== undefined) meta.source = at;
  if (Object.keys(sources).length) meta.sources = sources;
  return Object.keys(meta).length ? meta : undefined;
}

/** Ids in declaration order, numbered on collision: the same file declares the same ids. */
function idMaker() {
  const taken = new Set<string>();
  return (base: string) => {
    const b = slug(base);
    let id = b;
    for (let n = 2; taken.has(id); n++) id = `${b}_${n}`;
    taken.add(id);
    return id;
  };
}

function node(id: string, type: string, inputs: Record<string, unknown>, label?: string, meta?: Record<string, unknown>): IRNode {
  return { id, type, ...(label !== undefined ? { label } : {}), inputs, ...(meta ? { meta } : {}) };
}
const wire = (n: string, port: string) => ({ wire: { node: n, port } });

// ── Video ────────────────────────────────────────────────────────────────────────────────────────────────────────

const VIDEO_EXT: Record<string, "video" | "audio" | "image"> = {
  mp4: "video", webm: "video", mov: "video", mkv: "video", m4v: "video", ogv: "video",
  wav: "audio", mp3: "audio", ogg: "audio", oga: "audio", m4a: "audio", flac: "audio", aac: "audio", opus: "audio",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", bmp: "image", svg: "image",
};
/** What a media file is, by its extension. */
export function mediaKind(src: string): "video" | "audio" | "image" | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(src)?.[1]?.toLowerCase();
  return (ext && VIDEO_EXT[ext]) || null;
}

export const VIDEO_TRACK_KINDS = ["video", "audio", "midi"] as const;
/** A `<shape>` clip's shape (the video editor's stickers) and its look; `content` is the glyph of an emoji or star, or SVG path data. */
export const SHAPE_KINDS = ["emoji", "rect", "ellipse", "triangle", "star", "arrow", "heart", "speech", "svg"] as const;
export const SHAPE_LOOK = { fill: "#ffd166", stroke: "#00000000", strokeWidth: 0 } as const;
/** A shape's content when not given: the star's glyph, else none. */
export const shapeContent = (kind: string): string => (kind === "star" ? "⭐" : "");
/** A `<midi>` clip's instruments (the video editor's synth voices) and its defaults. */
export const MIDI_INSTRUMENTS = [
  "grandPiano", "electricPiano", "synthLead", "synthPad", "strings", "organ", "bass", "pluck", "bell", "sawLead", "squareLead",
  "superSaw", "reeseBass", "subBass", "fmBell", "musicBox", "marimba", "vibraphone", "kalimba", "harp", "clav", "brass", "flute",
  "choir", "glass", "sineLead", "pwmPad", "pluckSynth", "eightBit", "drumKit",
] as const;
export const MIDI_CLIP = { instrument: "grandPiano", gain: 0.8 } as const;
export const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut", "hold", "bezier"] as const;
export const TRANSITIONS = [
  "none", "cut", "crossDissolve", "fadeToBlack", "fadeToWhite", "dipToColor", "wipeLeft", "wipeRight", "wipeUp",
  "wipeDown", "diagonalWipe", "barnDoors", "iris", "diamond", "clockWipe", "pixelDissolve", "pushLeft", "pushRight",
  "slideUp", "slideDown", "zoomIn", "zoomBlur", "glitch", "kineticMatte", "shapeWipe",
] as const;
export const EFFECT_TYPES = [
  "brightnessContrast", "saturation", "hueRotate", "gaussianBlur", "sharpen", "pixelate", "chromaKey", "twist", "wave",
  "mirror", "vignette", "glow", "grayscale", "sepia", "invert", "posterize", "edges", "chromaticAberration", "bulge",
  "duotone", "colorWheels", "mask", "lut",
] as const;
/** A transition's alignment on the cut: it starts at the cut, is centred on it, or ends at it. */
export const TRANSITION_ALIGN = ["start", "center", "end"] as const;
/**
 * A video's audio effects (a clip's, a track's or the master's chain), by tag: each prop and its default. The tags are
 * the song's where a song has one (`gain`, `filter`, `delay`, `reverb`, `eq`); a delay's time is seconds in a video.
 */
export const VIDEO_AUDIO_EFFECTS: Readonly<Record<string, Readonly<Record<string, number | string>>>> = {
  gain: { gain: 1 },
  eq: { lowGain: 0, midGain: 0, highGain: 0 },
  filter: { mode: "lowpass", freq: 1200, q: 1 },
  delay: { time: 0.3, feedback: 0.4, mix: 0.35 },
  reverb: { decay: 2, mix: 0.35 },
  compressor: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
  distortion: { amount: 0.4, mix: 1 },
};
export const FILTER_MODES = ["lowpass", "highpass", "bandpass"] as const;
/** A filter's frequency and Q when not written, by mode (the editor's defaults for a new one). */
export const FILTER_DEFAULTS: Readonly<Record<string, { frequency: number; q: number }>> = {
  lowpass: { frequency: 1200, q: 1 },
  highpass: { frequency: 300, q: 1 },
  bandpass: { frequency: 1500, q: 2 },
};
/** The bounds of an audio effect's props (min, max). */
const AUDIO_BOUNDS: Readonly<Record<string, readonly [number, number]>> = {
  gain: [0, 16], lowGain: [-40, 40], midGain: [-40, 40], highGain: [-40, 40], freq: [10, 24000], q: [0.0001, 100],
  time: [0, 2], feedback: [0, 0.95], mix: [0, 1], decay: [0.01, 20], threshold: [-100, 0], ratio: [1, 20], attack: [0, 1],
  release: [0, 1], amount: [0, 1],
};
/** One audio effect element as the editor's effect: the tag's engine type (a filter is its mode) and its params. */
function audioEffect(el: DesignElement, makeId: (base: string) => string): { id: string; type: string; enabled: boolean; params: Record<string, number> } {
  const spec = VIDEO_AUDIO_EFFECTS[el.type]!;
  refuseUnknown(el, [...Object.keys(spec), "enabled"]);
  const params: Record<string, number> = {};
  let type = el.type;
  if (el.type === "filter") {
    type = str(el, "mode", FILTER_MODES) ?? "lowpass";
    const d = FILTER_DEFAULTS[type]!;
    params.frequency = num(el, "freq", { min: AUDIO_BOUNDS.freq![0], max: AUDIO_BOUNDS.freq![1] }) ?? d.frequency;
    params.q = num(el, "q", { min: AUDIO_BOUNDS.q![0], max: AUDIO_BOUNDS.q![1] }) ?? d.q;
  } else
    for (const [k, d] of Object.entries(spec)) {
      const [min, max] = AUDIO_BOUNDS[k]!;
      params[k] = num(el, k, { min, max }) ?? (d as number);
    }
  return { id: makeId(`afx_${type}`), type, enabled: bool(el, "enabled") ?? true, params };
}
/** A clip's intro and outro animations (`<intro preset duration>`, `<outro preset duration>`; the video editor's presets). */
export const ANIM_PRESETS = ["fade", "slideL", "slideR", "slideU", "slideD", "pop", "rise", "spin"] as const;
/** The properties a clip's keyframes animate (an effect's keyframes name a `param` of it). */
export const ANIMATABLE = ["opacity", "volume", "transform.x", "transform.y", "transform.scaleX", "transform.scaleY", "transform.rotation"] as const;

/** A clip's transform, colour and text: the props that set one field of each, and the field's default. */
export const CLIP_TRANSFORM = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 } as const;
export const CLIP_COLOR = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, brightness: 0, hue: 0 } as const;
export const TITLE_TEXT = {
  text: "Title",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 96,
  color: "#ffffff",
  bold: true,
  italic: false,
  align: "center",
  background: "transparent",
  strokeColor: "#000000",
  strokeWidth: 0,
} as const;
export const VIDEO_SETTINGS = { width: 1920, height: 1080, fps: 30, sampleRate: 48000, background: "#000000" } as const;
const TRACK_HEIGHT = { video: 64, audio: 48, midi: 56 } as const;

/** A clip's crop: the fraction of its picture hidden at each edge (the editor's `crop`). */
export const CLIP_CROP = { cropTop: "top", cropRight: "right", cropBottom: "bottom", cropLeft: "left" } as const;
const CLIP_PROPS = ["name", "start", "duration", "in", "out", "speed", "opacity", "volume", "blendMode", "fitMode", ...Object.keys(CLIP_TRANSFORM), ...Object.keys(CLIP_COLOR), ...Object.keys(CLIP_CROP)];

/** What an `<override>` in a clip may set on one artboard: its look (not its sound), transform, colour and crop; a title's
 *  text fields; a `<clip>`'s media file (`src`, of the same kind); a `<shape>`'s fill, stroke and strokeWidth; an
 *  `<artboard>` clip's drawing `inputs`; and its own `<keyframe property>`s of the look and transform (on that artboard
 *  the property follows them, not the clip's). `noKeys` names the properties with no keys on that artboard. An
 *  `<override>` in an `<effect>` sets its params and `enabled`, holds `<keyframe param>`s and takes `noKeys` of params. */
export const OVERRIDE_LOOK = ["opacity", "blendMode", "fitMode"] as const;
/** The properties an `<override>`'s own keyframes animate: the picture's, not the sound's. */
export const OVERRIDE_ANIMATABLE = ANIMATABLE.filter((p) => p !== "volume");
/** A `<shape>`'s look an `<override>` sets. */
export const OVERRIDE_SHAPE = ["fill", "stroke", "strokeWidth"] as const;
/** A video's own artboard (`<artboard name width height>` in the `<video>`): its props. */
export const VIDEO_ARTBOARD_PROPS = ["name", "width", "height"] as const;
type ClipOverride = Record<string, unknown> & { src?: string };

/** One `<override artboard>` in a clip: what the clip is on that artboard. */
function clipOverride(el: DesignElement, clip: DesignElement, artboards: ReadonlySet<string>): { artboard: string; override: ClipOverride } {
  const own = clip.type === "title" ? Object.keys(TITLE_TEXT) : clip.type === "clip" ? ["src"] : clip.type === "shape" ? [...OVERRIDE_SHAPE] : clip.type === "artboard" ? ["inputs"] : [];
  refuseUnknown(el, ["artboard", "noKeys", ...OVERRIDE_LOOK, ...Object.keys(CLIP_TRANSFORM), ...Object.keys(CLIP_COLOR), ...Object.keys(CLIP_CROP), ...own]);
  const artboard = overrideArtboard(el, artboards);
  const o: ClipOverride = {};
  const opacity = num(el, "opacity", { min: 0, max: 1 });
  if (opacity !== undefined) o.opacity = opacity;
  const blend = str(el, "blendMode");
  if (blend !== undefined) o.blendMode = blend;
  const fit = str(el, "fitMode", ["fit", "fill", "stretch"]);
  if (fit !== undefined) o.fitMode = fit;
  const part = (spec: Record<string, unknown>, read: (k: string) => unknown, rename: (k: string) => string = (k) => k) => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(spec)) {
      const v = read(k);
      if (v !== undefined) out[rename(k)] = v;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const transform = part(CLIP_TRANSFORM, (k) => num(el, k));
  if (transform) o.transform = transform;
  const color = part(CLIP_COLOR, (k) => num(el, k, { min: k === "hue" ? -180 : -1, max: k === "hue" ? 180 : 1 }));
  if (color) o.color = color;
  const crop = part(CLIP_CROP, (k) => num(el, k, { min: 0, max: 0.49 }), (k) => CLIP_CROP[k as keyof typeof CLIP_CROP]);
  if (crop) o.crop = crop;
  if (clip.type === "title") {
    const text = part(TITLE_TEXT, (k) => {
      const d = TITLE_TEXT[k as keyof typeof TITLE_TEXT];
      return typeof d === "number" ? num(el, k, { min: 0 }) : typeof d === "boolean" ? bool(el, k) : str(el, k, k === "align" ? ["left", "center", "right"] : undefined);
    });
    if (text) o.text = text;
  }
  if (clip.type === "clip") {
    const src = str(el, "src");
    if (src !== undefined) o.src = src;
  }
  if (clip.type === "shape") {
    const look: Record<string, unknown> = {};
    const fill = str(el, "fill"), stroke = str(el, "stroke"), strokeWidth = num(el, "strokeWidth", { min: 0 });
    if (fill !== undefined) look.fill = fill;
    if (stroke !== undefined) look.stroke = stroke;
    if (strokeWidth !== undefined) look.strokeWidth = strokeWidth;
    if (Object.keys(look).length) o.sticker = look;
  }
  if (clip.type === "artboard") {
    const inputs = drawingInputs(el);
    if (inputs) o.inputs = inputs;
  }
  if (!Object.keys(o).length && el.props.noKeys === undefined && !childElements(el.props.children).length) throw new Error(`${where(el)} in ${where(clip)}: an override names what it sets on artboard "${artboard}"`);
  return { artboard, override: o };
}

/** What an `<override>`'s `noKeys` names: each of `allowed` (absent: any name), and none its own keys also key. */
function noKeysOf(el: DesignElement, keyed: readonly { property: string }[], name: (n: string) => string, allowed?: readonly string[]): string[] {
  const v = el.props.noKeys;
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.length || v.some((n) => typeof n !== "string" || !n || (allowed && !allowed.includes(n)))) throw new Error(`${where(el)}: noKeys is a list of ${allowed ? allowed.join(", ") : "params"}, not ${JSON.stringify(v)}`);
  const both = (v as string[]).find((n) => keyed.some((t) => t.property === name(n)));
  if (both) throw new Error(`${where(el)}: noKeys names ${both}, which this override keys`);
  return v as string[];
}

/** The artboard an `<override>` names: one the `<video>` declares. */
function overrideArtboard(el: DesignElement, artboards: ReadonlySet<string>): string {
  const artboard = str(el, "artboard");
  if (!artboard) throw new Error(`<override> names its artboard (artboard="…", one the <video> declares)`);
  if (!artboards.has(artboard))
    throw new Error(`<override artboard="${artboard}">: the <video> declares no <artboard name="${artboard}">${artboards.size ? ` (it declares ${[...artboards].map((a) => `"${a}"`).join(", ")})` : ""}`);
  return artboard;
}

/** The files a `<composition>` and an `<artboard>` name: another video's code, a drawing's code. */
export const COMPOSITION_FILE = /\.vid\.(tsx|jsx|py|rs)$/i;
export const ARTBOARD_FILE = /\.draw\.(tsx|jsx|py|rs)$/i;
/** How an artboard's page fills the clip's box, what the drawing is drawn as, and their values when not written. */
export const ARTBOARD_FITS = ["fill", "contain", "cover", "none"] as const;
export const ARTBOARD_REPRESENTATIONS = ["auto", "vector", "raster"] as const;
export const ARTBOARD = { fit: "contain", representation: "auto" } as const;
/** The `video.instance` port that holds a nested composition's ref. */
export const INSTANCE_REF = "__instance";

/** A `<composition>`'s or an `<artboard>`'s file: a path relative to this file, of the kind it names. */
function documentSrc(el: DesignElement, kind: RegExp, what: string): string {
  const src = str(el, "src");
  if (!src) throw new Error(`<${el.type}> names ${what} (src, relative to this file)`);
  if (/^[a-z]+:|^\//i.test(src)) throw new Error(`${where(el)}: src is a path relative to this file, not ${src}`);
  if (!kind.test(src)) throw new Error(`${where(el)}: ${src} is not ${what}`);
  return src;
}

/** A nested composition's input values: its parameters by name, each a number. */
function inputValues(el: DesignElement): Record<string, number> {
  const v = el.props.inputs;
  if (v === undefined) return {};
  if (typeof v !== "object" || v === null || Array.isArray(v) || Object.values(v).some((x) => typeof x !== "number" || !Number.isFinite(x)))
    throw new Error(`${where(el)}: inputs is { parameter: number }, not ${JSON.stringify(v)}`);
  if (INSTANCE_REF in v) throw new Error(`${where(el)}: ${INSTANCE_REF} is not a parameter`);
  return { ...(v as Record<string, number>) };
}

/** An artboard's input values: the drawing's parameters (`export const params`) by name, each a number, a text or a
 *  yes/no. Read into the reference's `overrides`, which the drawing is run with. */
function drawingInputs(el: DesignElement): Record<string, number | string | boolean> | undefined {
  const v = el.props.inputs;
  if (v === undefined) return undefined;
  const ok = (x: unknown) => typeof x === "string" || typeof x === "boolean" || (typeof x === "number" && Number.isFinite(x));
  if (typeof v !== "object" || v === null || Array.isArray(v) || !Object.values(v).every(ok))
    throw new Error(`${where(el)}: inputs is { parameter: number | text | true/false }, not ${JSON.stringify(v)}`);
  return Object.keys(v).length ? { ...(v as Record<string, number | string | boolean>) } : undefined;
}

/** An artboard's `crop`: the rectangle of the drawing's page to show, `{ x, y, width, height }` in the page's own units. */
function cropRect(el: DesignElement): { x: number; y: number; width: number; height: number } | undefined {
  const v = el.props.crop as Record<string, unknown> | undefined;
  if (v === undefined) return undefined;
  const keys = ["x", "y", "width", "height"];
  const ok = typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 4 && keys.every((k) => typeof v[k] === "number" && Number.isFinite(v[k] as number)) && (v.width as number) > 0 && (v.height as number) > 0;
  if (!ok) throw new Error(`${where(el)}: crop is { x, y, width, height } with a width and a height above 0, not ${JSON.stringify(v)}`);
  return { x: v.x as number, y: v.y as number, width: v.width as number, height: v.height as number };
}

/** A clip's length: out − in at its speed, or its duration. */
function clipLength(c: DesignElement, inPoint: number, speed: number, picture: boolean): number {
  const out = num(c, "out", { min: 0 });
  const duration = num(c, "duration", { min: 0 });
  if (out !== undefined && duration !== undefined) throw new Error(`${where(c)}: give out or duration, not both`);
  if (out !== undefined) {
    if (picture) throw new Error(`${where(c)}: a picture has no out (give its duration)`);
    if (out <= inPoint) throw new Error(`${where(c)}: out (${out}) is after in (${inPoint})`);
    return (out - inPoint) / speed;
  }
  if (duration === undefined) throw new Error(`${where(c)}: give its ${picture ? "duration" : "out (or duration)"} in seconds`);
  return duration;
}

interface Keyed {
  key: string;
  at: unknown;
}

/** A clip's children: its transition, its intro and outro, its effects (each with its keyframes) and its keyframes. */
function clipChildren(clip: DesignElement, clipId: string, sources: Record<string, unknown>, artboards: ReadonlySet<string>) {
  let transitionIn: { kind: string; duration: number; params?: Record<string, number | string> } = { kind: "none", duration: 0 };
  const audioEffects: ReturnType<typeof audioEffect>[] = [];
  const afxId = idMaker();
  const anims: { animIn?: { preset: string; duration: number }; animOut?: { preset: string; duration: number } } = {};
  const notes: { id: string; pitch: number; start: number; duration: number; velocity: number }[] = [];
  const noteId = idMaker();
  type KeyTrack = { property: string; keys: { id: string; time: number; value: number; easing: string; bezier?: number[] }[] };
  type EffectOverride = { enabled?: boolean; params?: Record<string, number>; keyframes?: KeyTrack[] };
  const effects: { id: string; type: string; enabled: boolean; params: Record<string, number>; colors?: Record<string, string>; src?: string; overrides?: Record<string, EffectOverride> }[] = [];
  const overrides: Record<string, ClipOverride> = {};
  const keyframes: KeyTrack[] = [];
  const fxId = idMaker();
  const kfId = idMaker();
  // An <override>'s keys go into its own tracks and have no source of their own: the override's element is theirs.
  const keyframe = (el: DesignElement, property: string, into: KeyTrack[] = keyframes, base = `kf_${clipId}`) => {
    const time = num(el, "time", { min: 0 });
    const value = num(el, "value");
    if (time === undefined || value === undefined) throw new Error(`${where(el)}: a keyframe has a time and a value`);
    const id = kfId(base);
    let track = into.find((k) => k.property === property);
    if (!track) into.push((track = { property, keys: [] }));
    const easing = str(el, "easing", EASINGS) ?? "linear";
    const bezier = el.props.bezier;
    if (bezier !== undefined && easing !== "bezier") throw new Error(`${where(el)}: bezier is read with easing="bezier"`);
    if (easing === "bezier") {
      if (!Array.isArray(bezier) || bezier.length !== 4 || bezier.some((v) => typeof v !== "number" || !Number.isFinite(v)) || [bezier[0], bezier[2]].some((x) => (x as number) < 0 || (x as number) > 1))
        throw new Error(`${where(el)}: an easing "bezier" names its curve: bezier={[x1, y1, x2, y2]} (x1 and x2 from 0 to 1)`);
    }
    track.keys.push({ id, time, value, easing, ...(easing === "bezier" ? { bezier: [...(bezier as number[])] } : {}) });
    track.keys.sort((a, b) => a.time - b.time);
    if (into === keyframes) sources[`keyframe:${id}`] = sourceMeta(el);
  };
  let sawTransition = false;
  for (const el of childElements(clip.props.children)) {
    switch (el.type) {
      case "transition": {
        refuseUnknown(el, ["kind", "duration", "align", "color", "shape"]);
        if (sawTransition) throw new Error(`${where(clip)}: a clip has one <transition> (into it)`);
        sawTransition = true;
        transitionIn = { kind: str(el, "kind", TRANSITIONS) ?? "crossDissolve", duration: num(el, "duration", { min: 0 }) ?? 0.5 };
        const params: Record<string, number | string> = {};
        const align = str(el, "align", TRANSITION_ALIGN), color = str(el, "color"), shape = num(el, "shape", { min: 0 });
        if (align !== undefined) params.align = align;
        if (color !== undefined) params.color = color;
        if (shape !== undefined) params.shape = shape;
        if (Object.keys(params).length) transitionIn.params = params;
        sources.transition = sourceMeta(el);
        break;
      }
      case "note": {
        if (clip.type !== "midi") throw new Error(`<note> is read in a <midi> clip, not a <${clip.type}>`);
        refuseUnknown(el, ["pitch", "start", "duration", "velocity"]);
        const pitch = pitchOf(el.props.pitch);
        if (pitch === null) throw new Error(`<note>: pitch is a MIDI number 0–127 or a name like "C4", not ${JSON.stringify(el.props.pitch)}`);
        const start = num(el, "start", { min: 0 }), duration = num(el, "duration", { min: 0 });
        if (start === undefined || duration === undefined) throw new Error(`<note>: a note has a start and a duration (seconds in the clip)`);
        const id = noteId(`note_${clipId}`);
        notes.push({ id, pitch, start, duration, velocity: num(el, "velocity", { min: 0, max: 1 }) ?? 0.8 });
        sources[`note:${id}`] = sourceMeta(el);
        break;
      }
      case "intro":
      case "outro": {
        refuseUnknown(el, ["preset", "duration"]);
        const key = el.type === "intro" ? "animIn" : "animOut";
        if (anims[key]) throw new Error(`${where(clip)}: a clip has one <${el.type}>`);
        const preset = str(el, "preset", ANIM_PRESETS);
        if (!preset) throw new Error(`<${el.type}> names its preset (${ANIM_PRESETS.join(", ")})`);
        anims[key] = { preset, duration: num(el, "duration", { min: 0 }) ?? 1 };
        sources[el.type] = sourceMeta(el);
        break;
      }
      case "effect": {
        const type = str(el, "type", EFFECT_TYPES);
        if (!type) throw new Error(`${where(clip)}: an <effect> names its type`);
        const id = fxId(`fx_${type}`);
        const params: Record<string, number> = {};
        let src: string | undefined;
        if (type === "lut") {
          src = str(el, "src");
          if (!src) throw new Error(`<effect type="lut">: a LUT names its .cube file (src="looks/film.cube", relative to this file)`);
          if (/^[a-z]+:|^\//i.test(src)) throw new Error(`<effect type="lut">: src is a path relative to this file, not ${src}`);
        } else if (el.props.src !== undefined) throw new Error(`<effect type="${type}">: src is read on a LUT (type="lut")`);
        for (const [k, v] of Object.entries(el.props)) {
          if (["children", "key", "type", "enabled", "colors", "src"].includes(k)) continue;
          if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`<effect type="${type}">: ${k} is a number, not ${JSON.stringify(v)}`);
          params[k] = v;
        }
        const colors = el.props.colors;
        if (colors !== undefined && (typeof colors !== "object" || colors === null || Object.values(colors).some((c) => typeof c !== "string")))
          throw new Error(`<effect type="${type}">: colors is { name: "#rrggbb" }`);
        const fxOverrides: Record<string, EffectOverride> = {};
        effects.push({ id, type, enabled: bool(el, "enabled") ?? true, params, ...(colors ? { colors: { ...(colors as Record<string, string>) } } : {}), ...(src !== undefined ? { src } : {}) });
        sources[`effect:${id}`] = sourceMeta(el);
        for (const k of childElements(el.props.children)) {
          if (k.type === "override") {
            const artboard = overrideArtboard(k, artboards);
            if (fxOverrides[artboard]) throw new Error(`<effect type="${type}">: one <override> for artboard "${artboard}"`);
            const o: EffectOverride = {};
            const on = bool(k, "enabled");
            if (on !== undefined) o.enabled = on;
            for (const [p, v] of Object.entries(k.props)) {
              if (["children", "key", "artboard", "enabled", "noKeys"].includes(p)) continue;
              if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`<override artboard="${artboard}"> in <effect type="${type}">: ${p} is a number, not ${JSON.stringify(v)}`);
              (o.params ??= {})[p] = v;
            }
            // Its own keyframes: on this artboard the param follows them, not the clip's.
            const keys: KeyTrack[] = [];
            for (const kf of childElements(k.props.children)) {
              if (kf.type !== "keyframe") throw new Error(`<${kf.type}> is not read in an <override> in an <effect> (it holds its artboard's <keyframe param time value>s)`);
              refuseUnknown(kf, ["param", "time", "value", "easing", "bezier"]);
              const param = str(kf, "param");
              if (!param) throw new Error(`${where(kf)}: an effect's keyframe names its param`);
              keyframe(kf, `effect.${id}.${param}`, keys, `kf_${clipId}_${artboard}`);
            }
            for (const p of noKeysOf(k, keys, (n) => `effect.${id}.${n}`)) keys.push({ property: `effect.${id}.${p}`, keys: [] });
            if (keys.length) o.keyframes = keys;
            if (!Object.keys(o).length) throw new Error(`<override artboard="${artboard}"> in <effect type="${type}"> names what it sets`);
            fxOverrides[artboard] = o;
            sources[`effectOverride:${id}:${artboard}`] = sourceMeta(k);
            continue;
          }
          if (k.type !== "keyframe") throw new Error(`<${k.type}> is not read in an <effect> (its keyframes are <keyframe param time value>, its overrides <override artboard>)`);
          refuseUnknown(k, ["param", "time", "value", "easing", "bezier"]);
          const param = str(k, "param");
          if (!param) throw new Error(`${where(k)}: an effect's keyframe names its param`);
          keyframe(k, `effect.${id}.${param}`);
        }
        if (Object.keys(fxOverrides).length) {
          effects[effects.length - 1]!.overrides = fxOverrides;
        }
        break;
      }
      case "override": {
        const { artboard, override } = clipOverride(el, clip, artboards);
        if (overrides[artboard]) throw new Error(`${where(clip)}: one <override> for artboard "${artboard}"`);
        // Its own keyframes: on this artboard the property follows them, not the clip's.
        const keys: KeyTrack[] = [];
        for (const k of childElements(el.props.children)) {
          if (k.type !== "keyframe") throw new Error(`<${k.type}> is not read in an <override> (it holds its artboard's <keyframe property time value>s)`);
          refuseUnknown(k, ["property", "time", "value", "easing", "bezier"]);
          const property = str(k, "property", OVERRIDE_ANIMATABLE);
          if (!property) throw new Error(`${where(k)}: a keyframe names its property (${OVERRIDE_ANIMATABLE.join(", ")})`);
          keyframe(k, property, keys, `kf_${clipId}_${artboard}`);
        }
        for (const property of noKeysOf(el, keys, (n) => n, OVERRIDE_ANIMATABLE)) keys.push({ property, keys: [] });
        if (keys.length) override.keyframes = keys;
        overrides[artboard] = override;
        sources[`override:${artboard}`] = sourceMeta(el);
        break;
      }
      case "keyframe": {
        refuseUnknown(el, ["property", "time", "value", "easing", "bezier"]);
        const property = str(el, "property", ANIMATABLE);
        if (!property) throw new Error(`${where(el)}: a keyframe names its property (${ANIMATABLE.join(", ")})`);
        keyframe(el, property);
        break;
      }
      default:
        if (VIDEO_AUDIO_EFFECTS[el.type]) {
          if ((clip.type !== "clip" && clip.type !== "midi") || (clip.type === "clip" && mediaKind(String(clip.props.src ?? "")) === "image"))
            throw new Error(`<${el.type}> is an audio effect: ${where(clip)} has no sound`);
          const fx = audioEffect(el, afxId);
          audioEffects.push(fx);
          sources[`audio:${fx.id}`] = sourceMeta(el);
          break;
        }
        throw new Error(`<${el.type}> is not read in a <${clip.type}> (a clip holds <transition>, <intro>, <outro>, <effect>, <keyframe>, <override> and audio effects (${Object.keys(VIDEO_AUDIO_EFFECTS).join(", ")}); a <midi> clip its <note>s)`);
    }
  }
  return { transitionIn, ...anims, effects, audioEffects, keyframes, notes, overrides };
}

/** Declare a video (`<video>` and its tracks) as the video editor's own op graph. */
export function declareVideo(root: DesignElement): Declaration {
  refuseUnknown(root, ["name", ...Object.keys(VIDEO_SETTINGS)]);
  const name = str(root, "name") ?? "Video";
  const settings = {
    width: num(root, "width", { min: 1 }) ?? VIDEO_SETTINGS.width,
    height: num(root, "height", { min: 1 }) ?? VIDEO_SETTINGS.height,
    fps: num(root, "fps", { min: 1 }) ?? VIDEO_SETTINGS.fps,
    sampleRate: num(root, "sampleRate", { min: 1 }) ?? VIDEO_SETTINGS.sampleRate,
    background: str(root, "background") ?? VIDEO_SETTINGS.background,
  };
  const nodes: Record<string, IRNode> = {};
  const id = idMaker();
  id("composite");
  const trackWires: unknown[] = [];
  const markers: { id: string; time: number; name: string; color: string }[] = [];
  const compositeSources: Record<string, unknown> = {};
  const masterEffects: ReturnType<typeof audioEffect>[] = [];
  const masterId = idMaker();
  // The video's own artboards first: an <override> anywhere names one of them.
  const artboards: { name: string; width: number; height: number }[] = [];
  for (const a of childElements(root.props.children)) {
    if (a.type !== "artboard") continue;
    if (a.props.src !== undefined) throw new Error(`${where(a)}: an artboard of a drawing goes on a <track>; an <artboard> in the <video> is another frame of it (name, width, height)`);
    refuseUnknown(a, VIDEO_ARTBOARD_PROPS);
    const an = str(a, "name");
    if (!an) throw new Error(`<artboard> in a <video> has a name (the <override>s name it)`);
    if (artboards.some((x) => x.name === an)) throw new Error(`${where(a)}: two artboards are named "${an}"`);
    const width = num(a, "width", { min: 1 }), height = num(a, "height", { min: 1 });
    if (width === undefined || height === undefined) throw new Error(`${where(a)}: give its width and height in pixels`);
    artboards.push({ name: an, width, height });
    compositeSources[`artboard:${an}`] = sourceMeta(a);
  }
  const artboardNames = new Set(artboards.map((a) => a.name));
  for (const tr of childElements(root.props.children)) {
    if (tr.type === "artboard") continue;
    if (VIDEO_AUDIO_EFFECTS[tr.type]) {
      const fx = audioEffect(tr, masterId);
      masterEffects.push(fx);
      compositeSources[`audio:${fx.id}`] = sourceMeta(tr);
      continue;
    }
    if (tr.type === "marker") {
      refuseUnknown(tr, ["name", "time", "color"]);
      const time = num(tr, "time", { min: 0 });
      if (time === undefined) throw new Error(`${where(tr)}: a marker has a time`);
      const mid = id(`marker_${markers.length + 1}`);
      markers.push({ id: mid, time, name: str(tr, "name") ?? "Marker", color: str(tr, "color") ?? "#f5c542" });
      compositeSources[`marker:${mid}`] = sourceMeta(tr);
      continue;
    }
    if (tr.type !== "track") throw new Error(`<${tr.type}> is not read in a <video> (it holds <track>, <artboard>, <marker> and the master's audio effects)`);
    refuseUnknown(tr, ["name", "kind", "muted", "hidden", "locked", "volume", "height"]);
    const kind = (str(tr, "kind", VIDEO_TRACK_KINDS) ?? "video") as (typeof VIDEO_TRACK_KINDS)[number];
    const trackName = str(tr, "name") ?? (kind === "audio" ? "A" : kind === "midi" ? "M" : "V");
    const trackId = id(`track_${trackName}`);
    const clipWires: unknown[] = [];
    const trackEffects: ReturnType<typeof audioEffect>[] = [];
    const trackSources: Record<string, unknown> = {};
    const trackFxId = idMaker();
    for (const c of childElements(tr.props.children)) {
      if (VIDEO_AUDIO_EFFECTS[c.type]) {
        const fx = audioEffect(c, trackFxId);
        trackEffects.push(fx);
        trackSources[`audio:${fx.id}`] = sourceMeta(c);
        continue;
      }
      const sources: Record<string, unknown> = {};
      let inputs: Record<string, unknown>;
      let clipName: string;
      let nested: { src: string; values: Record<string, number>; artboard?: string } | null = null;
      if (c.type === "clip") {
        refuseUnknown(c, ["src", "link", ...CLIP_PROPS]);
        const src = str(c, "src");
        if (!src) throw new Error(`<clip> names its media file (src="media/take-1.mp4", relative to this file)`);
        if (/^[a-z]+:|^\//i.test(src)) throw new Error(`${where(c)}: src is a path relative to this file, not ${src}`);
        const mk = mediaKind(src);
        if (!mk) throw new Error(`${where(c)}: ${src} is not a video, audio or image file this editor reads`);
        // A video file on an audio track is its sound; a sound file has no picture, and a still has no sound.
        if (mk === "audio" ? kind !== "audio" : mk === "image" && kind === "audio") throw new Error(`${where(c)}: ${mk === "audio" ? "a sound goes on an audio track" : "a picture goes on a video track"} (kind="${mk === "audio" ? "audio" : "video"}")`);
        const link = str(c, "link");
        if (link === "") throw new Error(`${where(c)}: link names the clips that are one take's picture and sound, not ""`);
        const assetId = slug(src);
        const sourceId = `src_${assetId}`;
        const fileName = src.split("/").pop()!;
        if (!nodes[sourceId])
          nodes[sourceId] = node(sourceId, "video.source", {
            asset: { id: assetId, kind: mk, name: fileName, url: "", path: src, duration: 0, width: 0, height: 0, hasAudio: mk !== "image" },
            __asset: { kind: "file", $file: src },
          }, fileName);
        clipName = str(c, "name") ?? fileName;
        const speed = num(c, "speed", { min: 0.01 }) ?? 1;
        const inPoint = num(c, "in", { min: 0 }) ?? 0;
        const duration = clipLength(c, inPoint, speed, mk === "image");
        inputs = { kind: kind === "audio" ? "audio" : mk, assetId, name: clipName, start: num(c, "start", { min: 0 }) ?? 0, duration, inPoint, speed };
        Object.assign(inputs, common(c));
        if (link !== undefined) inputs.link = link;
        inputs.source = wire(sourceId, "media");
      } else if (c.type === "composition") {
        // Another video, drawn live from its own code: a `video.instance` node (made below, once the clip has its id).
        refuseUnknown(c, ["src", "inputs", "artboard", ...CLIP_PROPS]);
        if (kind !== "video") throw new Error(`${where(c)}: a composition goes on a video track`);
        const src = documentSrc(c, COMPOSITION_FILE, "another video's code (a .vid.tsx, .vid.py or .vid.rs)");
        clipName = str(c, "name") ?? src.split("/").pop()!;
        const speed = num(c, "speed", { min: 0.01 }) ?? 1;
        const inPoint = num(c, "in", { min: 0 }) ?? 0;
        const duration = clipLength(c, inPoint, speed, false);
        inputs = { kind: "video", name: clipName, start: num(c, "start", { min: 0 }) ?? 0, duration, inPoint, speed, ...common(c) };
        // Which of the other video's own artboards it shows (absent: its own frame).
        const shows = str(c, "artboard");
        if (shows === "") throw new Error(`${where(c)}: artboard names one of the other video's own artboards, not ""`);
        nested = { src, values: inputValues(c), ...(shows !== undefined ? { artboard: shows } : {}) };
        inputs.source = null;
      } else if (c.type === "artboard") {
        // A drawing's page, drawn live: the clip keeps the reference, never the drawing.
        refuseUnknown(c, [...CLIP_PROPS.filter((p) => p !== "in" && p !== "out" && p !== "speed" && p !== "volume"), "src", "view", "fit", "representation", "crop", "inputs"]);
        if (kind !== "video") throw new Error(`${where(c)}: an artboard goes on a video track`);
        const src = documentSrc(c, ARTBOARD_FILE, "a drawing's code (a .draw.tsx, .draw.py or .draw.rs)");
        clipName = str(c, "name") ?? src.split("/").pop()!;
        const duration = num(c, "duration", { min: 0 });
        if (duration === undefined) throw new Error(`${where(c)}: give its duration in seconds`);
        const view = str(c, "view");
        const overrides = drawingInputs(c);
        const ref = { locator: src, fileKind: "drawing", representation: str(c, "representation", ARTBOARD_REPRESENTATIONS) ?? ARTBOARD.representation, ...(view !== undefined ? { view } : {}), ...(overrides ? { overrides } : {}) };
        inputs = { kind: "renderable", name: clipName, start: num(c, "start", { min: 0 }) ?? 0, duration, inPoint: 0, speed: 1, ...common(c), volume: 1 };
        const crop = cropRect(c);
        inputs.renderable = { ref, fit: str(c, "fit", ARTBOARD_FITS) ?? ARTBOARD.fit, ...(crop ? { crop } : {}) };
        inputs.source = null;
      } else if (c.type === "title") {
        refuseUnknown(c, [...CLIP_PROPS.filter((p) => p !== "in" && p !== "out" && p !== "speed" && p !== "volume"), ...Object.keys(TITLE_TEXT), "typewriter"]);
        if (kind !== "video") throw new Error(`${where(c)}: a title goes on a video track`);
        clipName = str(c, "name") ?? "Title";
        const duration = num(c, "duration", { min: 0 });
        if (duration === undefined) throw new Error(`${where(c)}: give its duration in seconds`);
        const text: Record<string, unknown> = {};
        for (const [k, d] of Object.entries(TITLE_TEXT)) {
          const v = typeof d === "number" ? num(c, k, { min: 0 }) : typeof d === "boolean" ? bool(c, k) : str(c, k, k === "align" ? ["left", "center", "right"] : undefined);
          text[k] = v ?? d;
        }
        const tw = num(c, "typewriter", { min: 0 });
        if (tw !== undefined) text.typewriter = tw;
        inputs = { kind: "text", name: clipName, start: num(c, "start", { min: 0 }) ?? 0, duration, inPoint: 0, speed: 1, ...common(c), volume: 1, text };
        inputs.source = null;
      } else if (c.type === "shape" || c.type === "adjustment") {
        // A shape and an adjustment layer are synthetic: no media, no in/out, speed 1, no sound.
        const own = c.type === "shape" ? ["kind", "content", ...Object.keys(SHAPE_LOOK)] : [];
        refuseUnknown(c, [...CLIP_PROPS.filter((p) => p !== "in" && p !== "out" && p !== "speed" && p !== "volume"), ...own]);
        if (kind !== "video") throw new Error(`${where(c)}: a <${c.type}> goes on a video track`);
        clipName = str(c, "name") ?? (c.type === "shape" ? "Sticker" : "Adjustment");
        const duration = num(c, "duration", { min: 0 });
        if (duration === undefined) throw new Error(`${where(c)}: give its duration in seconds`);
        inputs = { kind: c.type, name: clipName, start: num(c, "start", { min: 0 }) ?? 0, duration, inPoint: 0, speed: 1, ...common(c), volume: 1 };
        if (c.type === "shape") {
          const sk = str(c, "kind", SHAPE_KINDS);
          if (!sk) throw new Error(`${where(c)}: a <shape> names its kind (${SHAPE_KINDS.join(", ")})`);
          inputs.sticker = {
            kind: sk,
            content: str(c, "content") ?? shapeContent(sk),
            fill: str(c, "fill") ?? SHAPE_LOOK.fill,
            stroke: str(c, "stroke") ?? SHAPE_LOOK.stroke,
            strokeWidth: num(c, "strokeWidth", { min: 0 }) ?? SHAPE_LOOK.strokeWidth,
          };
        }
        inputs.source = null;
      } else if (c.type === "midi") {
        refuseUnknown(c, [...CLIP_PROPS.filter((p) => p !== "in" && p !== "out" && p !== "speed" && !(p in CLIP_CROP)), ...Object.keys(MIDI_CLIP)]);
        if (kind !== "midi") throw new Error(`${where(c)}: a <midi> clip goes on a midi track (kind="midi")`);
        clipName = str(c, "name") ?? "MIDI";
        const duration = num(c, "duration", { min: 0 });
        if (duration === undefined) throw new Error(`${where(c)}: give its duration in seconds`);
        inputs = { kind: "midi", name: clipName, start: num(c, "start", { min: 0 }) ?? 0, duration, inPoint: 0, speed: 1, ...common(c) };
        inputs.source = null;
      } else throw new Error(`<${c.type}> is not read on a <track> (it holds <clip>, <composition>, <artboard>, <title>, <shape>, <adjustment>, <midi> and audio effects)`);
      if (kind === "midi" && c.type !== "midi") throw new Error(`${where(c)}: a midi track holds <midi> clips`);
      const clipId = id(`clip_${clipName}`);
      if (nested) {
        const compId = id(`comp_${clipName}`);
        nodes[compId] = node(compId, "video.instance", { [INSTANCE_REF]: { path: nested.src, name: clipName, ...(nested.artboard !== undefined ? { artboard: nested.artboard } : {}) }, ...nested.values }, clipName);
        inputs.source = wire(compId, "frames");
      }
      const kids = clipChildren(c, clipId, sources, artboardNames);
      inputs.transitionIn = kids.transitionIn;
      if (kids.animIn) inputs.animIn = kids.animIn;
      if (kids.animOut) inputs.animOut = kids.animOut;
      inputs.effects = kids.effects;
      if (kids.audioEffects.length) inputs.audioEffects = kids.audioEffects;
      inputs.trackers = [];
      if (kids.keyframes.length) inputs.keyframes = kids.keyframes;
      if (Object.keys(kids.overrides).length) {
        // Another media file on one artboard is a source of its own, of the clip's kind.
        for (const [an, o] of Object.entries(kids.overrides)) {
          if (o.src === undefined) continue;
          const src = o.src;
          const own = mediaKind(String(c.props.src));
          if (/^[a-z]+:|^\//i.test(src)) throw new Error(`<override artboard="${an}"> in ${where(c)}: src is a path relative to this file, not ${src}`);
          const mk = mediaKind(src);
          if (!mk || mk !== own) throw new Error(`<override artboard="${an}"> in ${where(c)}: ${src} is not a ${own} file (the clip's own kind)`);
          const assetId = slug(src);
          const sourceId = `src_${assetId}`;
          const fileName = src.split("/").pop()!;
          if (!nodes[sourceId])
            nodes[sourceId] = node(sourceId, "video.source", {
              asset: { id: assetId, kind: mk, name: fileName, url: "", path: src, duration: 0, width: 0, height: 0, hasAudio: mk !== "image" },
              __asset: { kind: "file", $file: src },
            }, fileName);
          delete o.src;
          o.assetId = assetId;
        }
        inputs.overrides = kids.overrides;
      }
      if (c.type === "midi")
        inputs.midi = { notes: kids.notes, instrument: str(c, "instrument", MIDI_INSTRUMENTS) ?? MIDI_CLIP.instrument, gain: num(c, "gain", { min: 0 }) ?? MIDI_CLIP.gain };
      const { source, ...rest } = inputs;
      nodes[clipId] = node(clipId, "video.clip", { ...rest, source }, clipName, metaOf(c, sources));
      clipWires.push(wire(clipId, "frames"));
    }
    const trackInputs: Record<string, unknown> = {
      kind,
      name: trackName,
      muted: bool(tr, "muted") ?? false,
      hidden: bool(tr, "hidden") ?? false,
      locked: bool(tr, "locked") ?? false,
      height: num(tr, "height", { min: 16 }) ?? TRACK_HEIGHT[kind],
      volume: num(tr, "volume", { min: 0 }) ?? 1,
    };
    if (trackEffects.length) trackInputs.audioEffects = trackEffects;
    clipWires.forEach((w, i) => (trackInputs[`clips.${i + 1}`] = w));
    nodes[trackId] = node(trackId, "video.track", trackInputs, trackName, metaOf(tr, trackSources));
    trackWires.push(wire(trackId, "frames"));
  }
  const projectId = slug(`proj_${name}`);
  const composite: Record<string, unknown> = { id: projectId, name, settings, ...(artboards.length ? { artboards } : {}), ...(markers.length ? { markers } : {}), ...(masterEffects.length ? { masterEffects } : {}), createdAt: 0, updatedAt: 0 };
  trackWires.forEach((w, i) => (composite[`tracks.${i + 1}`] = w));
  nodes.composite = node("composite", "video.composite", composite, name, metaOf(root, compositeSources));
  const graph: IRGraph = { id: projectId, nodes, outputs: ["composite"], meta: { kind: "video" } };
  return new Declaration("video", JSON.parse(JSON.stringify(graph)) as IRGraph);
}

/** The props every clip and title shares: its look and level. */
function common(c: DesignElement): Record<string, unknown> {
  const transform: Record<string, number> = {};
  for (const [k, d] of Object.entries(CLIP_TRANSFORM)) transform[k] = num(c, k) ?? d;
  const color: Record<string, number> = {};
  for (const [k, d] of Object.entries(CLIP_COLOR)) color[k] = num(c, k, { min: k === "hue" ? -180 : -1, max: k === "hue" ? 180 : 1 }) ?? d;
  const fit = str(c, "fitMode", ["fit", "fill", "stretch"]);
  const crop: Record<string, number> = {};
  for (const [k, edge] of Object.entries(CLIP_CROP)) crop[edge] = num(c, k, { min: 0, max: 0.49 }) ?? 0;
  const cropped = Object.keys(CLIP_CROP).some((k) => c.props[k] !== undefined);
  return {
    opacity: num(c, "opacity", { min: 0, max: 1 }) ?? 1,
    volume: num(c, "volume", { min: 0 }) ?? 1,
    // The blend modes are the compositing set the editor names (its own table); the editor checks the name.
    blendMode: str(c, "blendMode") ?? "normal",
    ...(fit ? { fitMode: fit } : {}),
    transform,
    color,
    ...(cropped ? { crop } : {}),
  };
}

// ── Song ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** A pitch as MIDI: a number (60), or a name with its octave ("C4" is 60, "F#3", "Bb2"). */
export function pitchOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= 127 ? v : null;
  if (typeof v !== "string") return null;
  const m = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(v.trim());
  if (!m) return null;
  const p = LETTER[m[1]!.toUpperCase()]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return p >= 0 && p <= 127 ? p : null;
}
/** A MIDI pitch's name ("C4" for 60; sharps). */
export function pitchName(p: number): string {
  return `${NOTE_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
}

export const WAVES = ["sine", "square", "sawtooth", "triangle"] as const;
export const SYNTH = { wave: "sawtooth", gain: 0.7, detune: 8, voices: 1, transpose: 0 } as const;
export const ENVELOPE = { attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.25 } as const;
/** The effects a track's chain can hold: the tag, its node type, its default name and its spec's fields. */
export const SONG_EFFECTS: Readonly<Record<string, { type: string; name: string; spec: Record<string, number | string> }>> = {
  gain: { type: "fx.gain", name: "Gain", spec: { gain: 1 } },
  filter: { type: "fx.filter", name: "Filter", spec: { mode: "lowpass", freq: 1200, q: 1 } },
  delay: { type: "fx.delay", name: "Delay", spec: { timeBeats: 0.5, feedback: 0.35, mix: 0.3 } },
  reverb: { type: "fx.reverb", name: "Reverb", spec: { decay: 1.8, mix: 0.3 } },
  eq: { type: "fx.eq", name: "EQ", spec: { lowGain: 0, midGain: 0, highGain: 0 } },
};
export const SONG_TRACK = { volumeDb: 0, pan: 0, mute: false, solo: false } as const;
export const SONG_MASTER = { volumeDb: 0, tempo: 120, timeSignature: "4/4", bars: 8 } as const;
/** A sampler's defaults: the file sounds at its root pitch (A4) at full gain. */
export const SAMPLER = { root: 69, gain: 1 } as const;
/** An audio clip's defaults: from the file's start (`in`, seconds), at its own level (`volume`). */
export const AUDIO_CLIP = { in: 0, volume: 1, loop: false } as const;

/** A time signature written "3/4" → { num: 3, den: 4 }. */
export function timeSignatureOf(v: unknown): { num: number; den: number } | null {
  const m = typeof v === "string" ? /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(v) : null;
  if (!m) return null;
  const num = Number(m[1]), den = Number(m[2]);
  return num >= 1 && num <= 32 && [1, 2, 4, 8, 16, 32].includes(den) ? { num, den } : null;
}

/** A tempo: beats per minute from the start (`tempo={120}`), or a map of changes (`[{ atBeat: 0, bpm: 120 }, …]`). */
export function tempoOf(v: unknown): { atBeat: number; bpm: number }[] | null {
  if (typeof v === "number") return v > 0 && Number.isFinite(v) ? [{ atBeat: 0, bpm: v }] : null;
  if (!Array.isArray(v) || !v.length) return null;
  const out: { atBeat: number; bpm: number }[] = [];
  let prev = -Infinity;
  for (const c of v) {
    const atBeat = (c as { atBeat?: unknown })?.atBeat, bpm = (c as { bpm?: unknown })?.bpm;
    if (typeof atBeat !== "number" || typeof bpm !== "number" || !(bpm > 0) || atBeat < prev) return null;
    out.push({ atBeat, bpm });
    prev = atBeat;
  }
  return out[0]!.atBeat <= 0 ? out : null;
}

/** A sound file named by a path relative to the song (`src`), checked to be one. */
function soundSrc(el: DesignElement): string {
  const src = str(el, "src");
  if (!src) throw new Error(`<${el.type}> names its sound file (src="media/tone.wav", relative to this file)`);
  if (/^[a-z]+:|^\//i.test(src)) throw new Error(`${where(el)}: src is a path relative to this file, not ${src}`);
  if (mediaKind(src) !== "audio") throw new Error(`${where(el)}: ${src} is not a sound file this studio reads`);
  return src;
}
/** A file's name without its folder and extension: an audio clip's name when it gives none. */
const stemOf = (src: string) => src.replace(/^.*\//, "").replace(/\.[^.]+$/, "");

/**
 * Declare a song (`<song>` and its tracks) as the music studio's own op graph. A track plays a `<synth>` or a
 * `<sampler>` (an instrument: its `<clip>`s hold notes), or holds audio clips (`<clip src>`: a sound file placed on
 * the song, played by the track's player); effects follow the instrument or the player.
 */
export function declareSong(root: DesignElement): Declaration {
  refuseUnknown(root, ["name", "cycleStart", "cycleEnd", ...Object.keys(SONG_MASTER)]);
  const name = str(root, "name") ?? "Song";
  const tempo = root.props.tempo === undefined ? [{ atBeat: 0, bpm: SONG_MASTER.tempo }] : tempoOf(root.props.tempo);
  if (!tempo) throw new Error(`<song>: tempo is beats per minute (120), or [{ atBeat: 0, bpm: 120 }, …] sorted by beat`);
  const timeSig = timeSignatureOf(root.props.timeSignature ?? SONG_MASTER.timeSignature);
  if (!timeSig) throw new Error(`<song>: timeSignature is "beats/unit" ("4/4", "6/8")`);
  const nodes: Record<string, IRNode> = {};
  const id = idMaker();
  id("master");
  const master: Record<string, unknown> = {
    name: "Master",
    volumeDb: num(root, "volumeDb") ?? SONG_MASTER.volumeDb,
    tempo,
    timeSig,
    bars: num(root, "bars", { min: 1 }) ?? SONG_MASTER.bars,
  };
  const cycleStart = num(root, "cycleStart", { min: 0 }), cycleEnd = num(root, "cycleEnd", { min: 0 });
  if ((cycleStart === undefined) !== (cycleEnd === undefined)) throw new Error(`<song>: a cycle names both its cycleStart and its cycleEnd (beats)`);
  if (cycleStart !== undefined && cycleEnd !== undefined) {
    if (!(cycleEnd > cycleStart)) throw new Error(`<song>: cycleEnd (${cycleEnd}) comes after cycleStart (${cycleStart})`);
    master.cycle = { start: cycleStart, end: cycleEnd };
  }
  let order = 0;
  for (const tr of childElements(root.props.children)) {
    if (tr.type !== "track") throw new Error(`<${tr.type}> is not read in a <song> (it holds <track>)`);
    refuseUnknown(tr, ["name", "colorIndex", ...Object.keys(SONG_TRACK)]);
    const trackName = str(tr, "name") ?? `Track ${order + 1}`;
    const trackId = id(`track_${trackName}`);
    const children = childElements(tr.props.children);
    // A track without an instrument that holds anything is an audio track: its player comes first in the chain.
    const audioTrack = children.length > 0 && !children.some((el) => el.type === "synth" || el.type === "sampler");
    let upstream: string | null = null;
    const clips: string[] = [];
    let instrument: string | null = null;
    let player: string | null = null;
    if (audioTrack) {
      player = id(`player_${trackName}`);
      nodes[player] = node(player, "player", { name: trackName });
      upstream = player;
    }
    for (const el of children) {
      const fx = SONG_EFFECTS[el.type];
      if (el.type === "synth" || el.type === "sampler") {
        if (instrument) throw new Error(`${where(tr)}: a track plays one instrument (a <synth> or a <sampler>)`);
        const env: Record<string, number> = {};
        let spec: Record<string, unknown>;
        if (el.type === "synth") {
          refuseUnknown(el, ["name", ...Object.keys(SYNTH), ...Object.keys(ENVELOPE)]);
          spec = { kind: "synth" };
          spec.wave = str(el, "wave", WAVES) ?? SYNTH.wave;
          for (const k of ["gain", "detune", "voices", "transpose"] as const) spec[k] = num(el, k) ?? SYNTH[k];
        } else {
          refuseUnknown(el, ["name", "src", "root", "gain", ...Object.keys(ENVELOPE)]);
          const baseNote = el.props.root === undefined ? SAMPLER.root : pitchOf(el.props.root);
          if (baseNote === null) throw new Error(`<sampler>: root is the pitch the file sounds at, a MIDI number (0–127) or a name ("A4"), not ${JSON.stringify(el.props.root)}`);
          spec = { kind: "sampler", src: soundSrc(el), baseNote, gain: num(el, "gain", { min: 0 }) ?? SAMPLER.gain };
        }
        for (const [k, d] of Object.entries(ENVELOPE)) env[k] = num(el, k, { min: 0 }) ?? d;
        spec.env = env;
        instrument = id(`inst_${trackName}`);
        nodes[instrument] = node(instrument, "instrument", { name: str(el, "name") ?? trackName, spec }, undefined, metaOf(el));
        upstream = instrument;
      } else if (fx) {
        if (!upstream) throw new Error(`<${el.type}> comes after the track's instrument (the chain runs instrument → effects → track)`);
        refuseUnknown(el, ["name", ...Object.keys(fx.spec)]);
        const spec: Record<string, unknown> = { type: el.type };
        for (const [k, d] of Object.entries(fx.spec))
          spec[k] = typeof d === "number" ? (num(el, k) ?? d) : (str(el, k, ["lowpass", "highpass", "bandpass"]) ?? d);
        const fid = id(`fx_${trackName}_${el.type}`);
        nodes[fid] = node(fid, fx.type, { name: str(el, "name") ?? fx.name, spec, audio: wire(upstream, "audio") }, undefined, metaOf(el));
        upstream = fid;
      } else if (el.type === "clip" && player && el.props.src !== undefined) {
        refuseUnknown(el, ["name", "src", "start", "length", "in", "volume", "loop"]);
        if (childElements(el.props.children).length) throw new Error(`${where(el)}: an audio clip holds no notes (notes go in a clip on a track with a <synth> or a <sampler>)`);
        const src = soundSrc(el);
        const clipName = str(el, "name") ?? stemOf(src);
        const cid = id(`clip_${clipName}`);
        nodes[cid] = node(
          cid,
          "sample",
          {
            name: clipName,
            src,
            start: num(el, "start", { min: 0 }) ?? 0,
            length: num(el, "length", { min: 0 }) ?? 4,
            offsetSeconds: num(el, "in", { min: 0 }) ?? AUDIO_CLIP.in,
            gain: num(el, "volume", { min: 0 }) ?? AUDIO_CLIP.volume,
            loop: bool(el, "loop") ?? AUDIO_CLIP.loop,
          },
          undefined,
          metaOf(el),
        );
        clips.push(cid);
      } else if (el.type === "clip") {
        if (el.props.src !== undefined)
          throw new Error(`${where(tr)}: a track that plays an instrument holds clips of notes; an audio clip (src) goes on a track without one`);
        refuseUnknown(el, ["name", "start", "length", "loop"]);
        const clipName = str(el, "name") ?? `${trackName} ${clips.length + 1}`;
        const cid = id(`clip_${clipName}`);
        const notes: { id: string; pitch: number; start: number; dur: number; vel: number }[] = [];
        const sources: Record<string, unknown> = {};
        for (const n of childElements(el.props.children)) {
          if (n.type !== "note") throw new Error(`<${n.type}> is not read in a <clip> (it holds <note>)`);
          refuseUnknown(n, ["pitch", "start", "duration", "velocity"]);
          const pitch = pitchOf(n.props.pitch);
          if (pitch === null) throw new Error(`<note>: pitch is a MIDI number (0–127) or a name ("C4", "F#3"), not ${JSON.stringify(n.props.pitch)}`);
          const nid = `${cid}_n${notes.length + 1}`;
          notes.push({ id: nid, pitch, start: num(n, "start", { min: 0 }) ?? 0, dur: num(n, "duration", { min: 0 }) ?? 1, vel: num(n, "velocity", { min: 0, max: 1 }) ?? 0.8 });
          sources[`note:${nid}`] = sourceMeta(n);
        }
        nodes[cid] = node(cid, "midiClip", { name: clipName, start: num(el, "start", { min: 0 }) ?? 0, length: num(el, "length", { min: 0 }) ?? 4, notes, loop: bool(el, "loop") ?? false }, undefined, metaOf(el, sources));
        clips.push(cid);
      } else throw new Error(`<${el.type}> is not read on a <track> (it holds a <synth> or a <sampler>, effects (${Object.keys(SONG_EFFECTS).join(", ")}) and <clip>)`);
    }
    if (instrument) clips.forEach((c, i) => (nodes[instrument!]!.inputs[`midi.${i + 1}`] = wire(c, "midi")));
    if (player) {
      const notes = clips.find((c) => nodes[c]!.type === "midiClip");
      if (notes) throw new Error(`${where(tr)}: its clips need a <synth> or a <sampler> to play them`);
      clips.forEach((c, i) => (nodes[player!]!.inputs[`audio.${i + 1}`] = wire(c, "audio")));
    }
    const trackInputs: Record<string, unknown> = {
      name: trackName,
      volumeDb: num(tr, "volumeDb") ?? SONG_TRACK.volumeDb,
      pan: num(tr, "pan", { min: -1, max: 1 }) ?? SONG_TRACK.pan,
      mute: bool(tr, "mute") ?? SONG_TRACK.mute,
      solo: bool(tr, "solo") ?? SONG_TRACK.solo,
      colorIndex: num(tr, "colorIndex", { min: 0 }) ?? order,
      ...(upstream ? { audio: wire(upstream, "audio") } : {}),
    };
    nodes[trackId] = node(trackId, "track", trackInputs, undefined, metaOf(tr, {}, { order }));
    master[`audio.${order + 1}`] = wire(trackId, "audio");
    order++;
  }
  nodes.master = node("master", "master", master, undefined, metaOf(root));
  const graph: IRGraph = { id: slug(`music_${name}`), nodes, outputs: ["master"], meta: { domain: "music", name } };
  return new Declaration("music", JSON.parse(JSON.stringify(graph)) as IRGraph);
}

/** Declare a media root element: a `<video>` or a `<song>`. */
export function fromMedia(root: DesignElement): Declaration {
  if (root.type === "video") return declareVideo(root);
  if (root.type === "song") return declareSong(root);
  throw new Error(`<${root.type}> is not a media root (a <video> or a <song>)`);
}
