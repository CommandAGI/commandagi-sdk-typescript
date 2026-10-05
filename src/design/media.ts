/**
 * A VIDEO OR A SONG IN JSX — the media editors' own documents, declared as the nodes the CommandAGI video editor
 * (`.vid.tsx`: `video.source`, `video.clip`, `video.track`, `video.composite`) and music studio (`.mus.tsx`: `midiClip`,
 * `instrument`, `fx.*`, `track`, `master`) store and edit. No second model: the editor opens what this declares.
 *
 *   export default () => (
 *     <video name="Balcony" width={1280} height={720} fps={30}>
 *       <track name="V1">
 *         <clip src="media/sky.png" start={0} duration={3} />
 *         <title text="Hello" start={0} duration={2} fontSize={72} />
 *       </track>
 *       <track name="A1" kind="audio">
 *         <clip src="media/tone.wav" start={0} in={0.5} out={2.5} volume={0.8} />
 *       </track>
 *     </video>
 *   );
 *
 *   export default () => (
 *     <song name="Loop" tempo={120} timeSignature="4/4" bars={8}>
 *       <track name="Keys">
 *         <synth wave="triangle" />
 *         <clip name="Keys 1" start={0} length={4}>
 *           <note pitch="C4" start={0} duration={1} velocity={0.8} />
 *         </clip>
 *       </track>
 *     </song>
 *   );
 *
 * Media files are named by path relative to the file (`src`), never inlined; the editor reads them. Times on a
 * video's timeline are seconds; times in a song are beats. Each node carries the element that declared it in
 * `meta.source`; what a node holds that is not a node (a clip's effects, transition, intro, outro and keyframes; a midi clip's
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
export const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut", "hold"] as const;
export const TRANSITIONS = [
  "none", "cut", "crossDissolve", "fadeToBlack", "fadeToWhite", "dipToColor", "wipeLeft", "wipeRight", "wipeUp",
  "wipeDown", "diagonalWipe", "barnDoors", "iris", "diamond", "clockWipe", "pixelDissolve", "pushLeft", "pushRight",
  "slideUp", "slideDown", "zoomIn", "zoomBlur", "glitch", "kineticMatte", "shapeWipe",
] as const;
export const EFFECT_TYPES = [
  "brightnessContrast", "saturation", "hueRotate", "gaussianBlur", "sharpen", "pixelate", "chromaKey", "twist", "wave",
  "mirror", "vignette", "glow", "grayscale", "sepia", "invert", "posterize", "edges", "chromaticAberration", "bulge",
  "duotone", "colorWheels", "mask",
] as const;
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

const CLIP_PROPS = ["name", "start", "duration", "in", "out", "speed", "opacity", "volume", "blendMode", "fitMode", ...Object.keys(CLIP_TRANSFORM), ...Object.keys(CLIP_COLOR)];

interface Keyed {
  key: string;
  at: unknown;
}

/** A clip's children: its transition, its intro and outro, its effects (each with its keyframes) and its keyframes. */
function clipChildren(clip: DesignElement, clipId: string, sources: Record<string, unknown>) {
  let transitionIn: { kind: string; duration: number; params?: Record<string, number | string> } = { kind: "none", duration: 0 };
  const anims: { animIn?: { preset: string; duration: number }; animOut?: { preset: string; duration: number } } = {};
  const notes: { id: string; pitch: number; start: number; duration: number; velocity: number }[] = [];
  const noteId = idMaker();
  const effects: { id: string; type: string; enabled: boolean; params: Record<string, number>; colors?: Record<string, string> }[] = [];
  const keyframes: { property: string; keys: { id: string; time: number; value: number; easing: string }[] }[] = [];
  const fxId = idMaker();
  const kfId = idMaker();
  const keyframe = (el: DesignElement, property: string) => {
    const time = num(el, "time", { min: 0 });
    const value = num(el, "value");
    if (time === undefined || value === undefined) throw new Error(`${where(el)}: a keyframe has a time and a value`);
    const id = kfId(`kf_${clipId}`);
    let track = keyframes.find((k) => k.property === property);
    if (!track) keyframes.push((track = { property, keys: [] }));
    track.keys.push({ id, time, value, easing: str(el, "easing", EASINGS) ?? "linear" });
    track.keys.sort((a, b) => a.time - b.time);
    sources[`keyframe:${id}`] = sourceMeta(el);
  };
  let sawTransition = false;
  for (const el of childElements(clip.props.children)) {
    switch (el.type) {
      case "transition": {
        refuseUnknown(el, ["kind", "duration"]);
        if (sawTransition) throw new Error(`${where(clip)}: a clip has one <transition> (into it)`);
        sawTransition = true;
        transitionIn = { kind: str(el, "kind", TRANSITIONS) ?? "crossDissolve", duration: num(el, "duration", { min: 0 }) ?? 0.5 };
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
        for (const [k, v] of Object.entries(el.props)) {
          if (["children", "key", "type", "enabled", "colors"].includes(k)) continue;
          if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`<effect type="${type}">: ${k} is a number, not ${JSON.stringify(v)}`);
          params[k] = v;
        }
        const colors = el.props.colors;
        if (colors !== undefined && (typeof colors !== "object" || colors === null || Object.values(colors).some((c) => typeof c !== "string")))
          throw new Error(`<effect type="${type}">: colors is { name: "#rrggbb" }`);
        effects.push({ id, type, enabled: bool(el, "enabled") ?? true, params, ...(colors ? { colors: { ...(colors as Record<string, string>) } } : {}) });
        sources[`effect:${id}`] = sourceMeta(el);
        for (const k of childElements(el.props.children)) {
          if (k.type !== "keyframe") throw new Error(`<${k.type}> is not read in an <effect> (its keyframes are <keyframe param time value>)`);
          refuseUnknown(k, ["param", "time", "value", "easing"]);
          const param = str(k, "param");
          if (!param) throw new Error(`${where(k)}: an effect's keyframe names its param`);
          keyframe(k, `effect.${id}.${param}`);
        }
        break;
      }
      case "keyframe": {
        refuseUnknown(el, ["property", "time", "value", "easing"]);
        const property = str(el, "property", ANIMATABLE);
        if (!property) throw new Error(`${where(el)}: a keyframe names its property (${ANIMATABLE.join(", ")})`);
        keyframe(el, property);
        break;
      }
      default:
        throw new Error(`<${el.type}> is not read in a <${clip.type}> (a clip holds <transition>, <intro>, <outro>, <effect> and <keyframe>; a <midi> clip its <note>s)`);
    }
  }
  return { transitionIn, ...anims, effects, keyframes, notes };
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
  for (const tr of childElements(root.props.children)) {
    if (tr.type === "marker") {
      refuseUnknown(tr, ["name", "time", "color"]);
      const time = num(tr, "time", { min: 0 });
      if (time === undefined) throw new Error(`${where(tr)}: a marker has a time`);
      const mid = id(`marker_${markers.length + 1}`);
      markers.push({ id: mid, time, name: str(tr, "name") ?? "Marker", color: str(tr, "color") ?? "#f5c542" });
      compositeSources[`marker:${mid}`] = sourceMeta(tr);
      continue;
    }
    if (tr.type !== "track") throw new Error(`<${tr.type}> is not read in a <video> (it holds <track> and <marker>)`);
    refuseUnknown(tr, ["name", "kind", "muted", "hidden", "locked", "volume", "height"]);
    const kind = (str(tr, "kind", VIDEO_TRACK_KINDS) ?? "video") as (typeof VIDEO_TRACK_KINDS)[number];
    const trackName = str(tr, "name") ?? (kind === "audio" ? "A" : kind === "midi" ? "M" : "V");
    const trackId = id(`track_${trackName}`);
    const clipWires: unknown[] = [];
    for (const c of childElements(tr.props.children)) {
      const sources: Record<string, unknown> = {};
      let inputs: Record<string, unknown>;
      let clipName: string;
      if (c.type === "clip") {
        refuseUnknown(c, ["src", ...CLIP_PROPS]);
        const src = str(c, "src");
        if (!src) throw new Error(`<clip> names its media file (src="media/take-1.mp4", relative to this file)`);
        if (/^[a-z]+:|^\//i.test(src)) throw new Error(`${where(c)}: src is a path relative to this file, not ${src}`);
        const mk = mediaKind(src);
        if (!mk) throw new Error(`${where(c)}: ${src} is not a video, audio or image file this editor reads`);
        if ((mk === "audio") !== (kind === "audio")) throw new Error(`${where(c)}: ${mk === "audio" ? "a sound goes on an audio track" : "a picture goes on a video track"} (kind="${mk === "audio" ? "audio" : "video"}")`);
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
        const out = num(c, "out", { min: 0 });
        let duration = num(c, "duration", { min: 0 });
        if (out !== undefined && duration !== undefined) throw new Error(`${where(c)}: give out or duration, not both`);
        if (out !== undefined) {
          if (mk === "image") throw new Error(`${where(c)}: a picture has no out (give its duration)`);
          if (out <= inPoint) throw new Error(`${where(c)}: out (${out}) is after in (${inPoint})`);
          duration = (out - inPoint) / speed;
        }
        if (duration === undefined) throw new Error(`${where(c)}: give its ${mk === "image" ? "duration" : "out (or duration)"} in seconds`);
        inputs = { kind: mk, assetId, name: clipName, start: num(c, "start", { min: 0 }) ?? 0, duration, inPoint, speed };
        Object.assign(inputs, common(c));
        inputs.source = wire(sourceId, "media");
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
        refuseUnknown(c, [...CLIP_PROPS.filter((p) => p !== "in" && p !== "out" && p !== "speed"), ...Object.keys(MIDI_CLIP)]);
        if (kind !== "midi") throw new Error(`${where(c)}: a <midi> clip goes on a midi track (kind="midi")`);
        clipName = str(c, "name") ?? "MIDI";
        const duration = num(c, "duration", { min: 0 });
        if (duration === undefined) throw new Error(`${where(c)}: give its duration in seconds`);
        inputs = { kind: "midi", name: clipName, start: num(c, "start", { min: 0 }) ?? 0, duration, inPoint: 0, speed: 1, ...common(c) };
        inputs.source = null;
      } else throw new Error(`<${c.type}> is not read on a <track> (it holds <clip>, <title>, <shape>, <adjustment> and <midi>)`);
      if (kind === "midi" && c.type !== "midi") throw new Error(`${where(c)}: a midi track holds <midi> clips`);
      const clipId = id(`clip_${clipName}`);
      const kids = clipChildren(c, clipId, sources);
      inputs.transitionIn = kids.transitionIn;
      if (kids.animIn) inputs.animIn = kids.animIn;
      if (kids.animOut) inputs.animOut = kids.animOut;
      inputs.effects = kids.effects;
      inputs.trackers = [];
      if (kids.keyframes.length) inputs.keyframes = kids.keyframes;
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
    clipWires.forEach((w, i) => (trackInputs[`clips.${i + 1}`] = w));
    nodes[trackId] = node(trackId, "video.track", trackInputs, trackName, metaOf(tr));
    trackWires.push(wire(trackId, "frames"));
  }
  const projectId = slug(`proj_${name}`);
  const composite: Record<string, unknown> = { id: projectId, name, settings, ...(markers.length ? { markers } : {}), createdAt: 0, updatedAt: 0 };
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
  return {
    opacity: num(c, "opacity", { min: 0, max: 1 }) ?? 1,
    volume: num(c, "volume", { min: 0 }) ?? 1,
    // The blend modes are the compositing set the editor names (its own table); the editor checks the name.
    blendMode: str(c, "blendMode") ?? "normal",
    ...(fit ? { fitMode: fit } : {}),
    transform,
    color,
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

/** Declare a song (`<song>` and its tracks) as the music studio's own op graph. */
export function declareSong(root: DesignElement): Declaration {
  refuseUnknown(root, ["name", ...Object.keys(SONG_MASTER)]);
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
  let order = 0;
  for (const tr of childElements(root.props.children)) {
    if (tr.type !== "track") throw new Error(`<${tr.type}> is not read in a <song> (it holds <track>)`);
    refuseUnknown(tr, ["name", "colorIndex", ...Object.keys(SONG_TRACK)]);
    const trackName = str(tr, "name") ?? `Track ${order + 1}`;
    const trackId = id(`track_${trackName}`);
    let upstream: string | null = null;
    const clips: string[] = [];
    let instrument: string | null = null;
    for (const el of childElements(tr.props.children)) {
      const fx = SONG_EFFECTS[el.type];
      if (el.type === "synth") {
        if (instrument) throw new Error(`${where(tr)}: a track plays one <synth>`);
        refuseUnknown(el, ["name", ...Object.keys(SYNTH), ...Object.keys(ENVELOPE)]);
        const spec: Record<string, unknown> = { kind: "synth" };
        spec.wave = str(el, "wave", WAVES) ?? SYNTH.wave;
        for (const k of ["gain", "detune", "voices", "transpose"] as const) spec[k] = num(el, k) ?? SYNTH[k];
        const env: Record<string, number> = {};
        for (const [k, d] of Object.entries(ENVELOPE)) env[k] = num(el, k, { min: 0 }) ?? d;
        spec.env = env;
        instrument = id(`inst_${trackName}`);
        nodes[instrument] = node(instrument, "instrument", { name: str(el, "name") ?? trackName, spec }, undefined, metaOf(el));
        upstream = instrument;
      } else if (fx) {
        if (!upstream) throw new Error(`<${el.type}> comes after the track's <synth> (the chain runs synth → effects → track)`);
        refuseUnknown(el, ["name", ...Object.keys(fx.spec)]);
        const spec: Record<string, unknown> = { type: el.type };
        for (const [k, d] of Object.entries(fx.spec))
          spec[k] = typeof d === "number" ? (num(el, k) ?? d) : (str(el, k, ["lowpass", "highpass", "bandpass"]) ?? d);
        const fid = id(`fx_${trackName}_${el.type}`);
        nodes[fid] = node(fid, fx.type, { name: str(el, "name") ?? fx.name, spec, audio: wire(upstream, "audio") }, undefined, metaOf(el));
        upstream = fid;
      } else if (el.type === "clip") {
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
      } else throw new Error(`<${el.type}> is not read on a <track> (it holds <synth>, effects (${Object.keys(SONG_EFFECTS).join(", ")}) and <clip>)`);
    }
    if (clips.length && !instrument) throw new Error(`${where(tr)}: its clips need a <synth> to play them`);
    if (instrument) clips.forEach((c, i) => (nodes[instrument!]!.inputs[`midi.${i + 1}`] = wire(c, "midi")));
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
