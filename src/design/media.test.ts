// A video or a song in JSX declares the media editors' own graphs. Pinned here: a clip's media is a source node
// named by its relative path (never inlined), out becomes a duration, titles carry their text; a song's chain is
// synth → effects → track → master with notes inline; an element's __source rides on its node (meta.source) and on
// what the node holds (meta.sources); what the vocabulary cannot say is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, pitchName, pitchOf } from "./index.js";

const wireTo = (node: string, port: string) => ({ wire: { node, port } });

test("a <video> declares sources, clips, tracks and the composite the video editor stores", () => {
  const tree = jsx("video", {
    name: "Cut",
    fps: 25,
    __source: 0,
    children: [
      jsx("track", {
        name: "V1",
        __source: 1,
        children: [
          jsx("clip", {
            src: "media/take.webm",
            start: 1,
            in: 2,
            out: 6,
            speed: 2,
            __source: 2,
            children: [jsx("transition", { kind: "crossDissolve", duration: 0.5, __source: 3 }), jsx("keyframe", { property: "opacity", time: 0, value: 0, __source: 4 })],
          }),
          jsx("title", { text: "Hello", start: 0, duration: 2, fontSize: 48, __source: 5 }),
        ],
      }),
      jsx("track", { name: "A1", kind: "audio", children: [jsx("clip", { src: "media/tone.wav", duration: 3, volume: 0.5 })] }),
      jsx("marker", { time: 4, name: "Drop", __source: 6 }),
    ],
  });
  const { graph: g } = declarationOf({ default: () => tree });
  assert.deepEqual(g.nodes["src_media_take.webm"]!.inputs.__asset, { kind: "file", $file: "media/take.webm" }, "media are referenced by path");
  const clip = g.nodes["clip_take.webm"]!;
  assert.equal(clip.inputs.duration, 2, "out - in, at twice the speed");
  assert.deepEqual(clip.inputs.source, wireTo("src_media_take.webm", "media"));
  assert.deepEqual(clip.inputs.transitionIn, { kind: "crossDissolve", duration: 0.5 });
  assert.deepEqual(clip.meta, { source: 2, sources: { transition: 3, "keyframe:kf_clip_take.webm": 4 } });
  const title = g.nodes.clip_Title!;
  assert.equal((title.inputs.text as { text: string; fontSize: number }).fontSize, 48);
  assert.deepEqual(g.nodes.track_V1!.inputs["clips.2"], wireTo("clip_Title", "frames"));
  assert.equal(g.nodes.track_A1!.inputs.kind, "audio");
  const composite = g.nodes.composite!;
  assert.deepEqual(composite.inputs["tracks.1"], wireTo("track_V1", "frames"));
  assert.deepEqual((composite.inputs.settings as { fps: number }).fps, 25);
  assert.deepEqual(composite.meta, { source: 0, sources: { "marker:marker_1": 6 } });
  const video = (...children: unknown[]) => () => declarationOf({ default: jsx("video", { children: [jsx("track", { children })] }) });
  assert.throws(video(jsx("clip", { src: "data:video/mp4;base64,AAAA", duration: 1 })), /relative to this file/);
  assert.throws(video(jsx("clip", { src: "a.wav", duration: 1 })), /a sound goes on an audio track/);
  assert.throws(video(jsx("clip", { src: "a.mp4" })), /give its out \(or duration\)/);
  assert.throws(video(jsx("clip", { src: "a.mp4", out: 2, trackers: [] })), /prop trackers is not read/);
});

test("a video file on an audio track is its sound; two clips with one link are a take's picture and sound", () => {
  const take = { src: "media/take.mp4", link: "L1", start: 1, in: 2, out: 4 };
  const g = declarationOf({
    default: jsx("video", {
      children: [jsx("track", { name: "V1", children: [jsx("clip", { ...take, volume: 0 })] }), jsx("track", { name: "A1", kind: "audio", children: [jsx("clip", take)] })],
    }),
  }).graph;
  const clips = Object.values(g.nodes).filter((n) => n.type === "video.clip");
  assert.deepEqual(clips.map((n) => [n.inputs.kind, n.inputs.link, n.inputs.assetId, n.inputs.volume]), [
    ["video", "L1", "media_take.mp4", 0],
    ["audio", "L1", "media_take.mp4", 1],
  ]);
  const audio = (c: unknown) => () => declarationOf({ default: jsx("video", { children: [jsx("track", { kind: "audio", children: [c] })] }) });
  assert.throws(audio(jsx("clip", { src: "a.png", duration: 1 })), /a picture goes on a video track/);
  assert.throws(audio(jsx("clip", { src: "a.mp4", out: 1, link: "" })), /link names the clips/);
});

test("a clip's <intro> and <outro> are its intro and outro animations (animIn, animOut), each with its element", () => {
  const tree = jsx("video", {
    children: [
      jsx("track", {
        name: "V1",
        children: [
          jsx("title", {
            text: "Hi",
            duration: 2,
            __source: 0,
            children: [jsx("intro", { preset: "rise", duration: 0.34, __source: 1 }), jsx("outro", { preset: "fade", __source: 2 })],
          }),
        ],
      }),
    ],
  });
  const clip = declarationOf({ default: () => tree }).graph.nodes.clip_Title!;
  assert.deepEqual(clip.inputs.animIn, { preset: "rise", duration: 0.34 });
  assert.deepEqual(clip.inputs.animOut, { preset: "fade", duration: 1 }, "a second when the duration is not given");
  assert.deepEqual(clip.meta, { source: 0, sources: { intro: 1, outro: 2 } });
  const titled = (...children: unknown[]) => () => declarationOf({ default: jsx("video", { children: [jsx("track", { children: [jsx("title", { duration: 1, children })] })] }) });
  assert.throws(titled(jsx("intro", { preset: "wobble" })), /preset is one of/);
  assert.throws(titled(jsx("intro", { preset: "fade" }), jsx("intro", { preset: "pop" })), /a clip has one <intro>/);
  assert.throws(titled(jsx("outro", {})), /<outro> names its preset/);
});

test("a <song> declares the chain synth → effects → track → master, with each clip's notes inline", () => {
  const tree = jsx("song", {
    name: "Loop",
    tempo: 96,
    timeSignature: "3/4",
    children: [
      jsx("track", {
        name: "Keys",
        children: [
          jsx("synth", { wave: "triangle", attack: 0.02 }),
          jsx("reverb", { mix: 0.5 }),
          jsx("clip", { start: 4, children: [jsx("note", { pitch: "C4", start: 0, duration: 1, __source: 9 }), jsx("note", { pitch: 64, start: 1 })] }),
        ],
      }),
    ],
  });
  const { graph: g } = declarationOf({ default: tree });
  const master = g.nodes.master!;
  assert.deepEqual(master.inputs.tempo, [{ atBeat: 0, bpm: 96 }]);
  assert.deepEqual(master.inputs.timeSig, { num: 3, den: 4 });
  assert.deepEqual(master.inputs["audio.1"], wireTo("track_Keys", "audio"));
  assert.deepEqual(g.nodes.track_Keys!.inputs.audio, wireTo("fx_Keys_reverb", "audio"));
  assert.deepEqual(g.nodes.fx_Keys_reverb!.inputs.audio, wireTo("inst_Keys", "audio"));
  assert.deepEqual(g.nodes.inst_Keys!.inputs["midi.1"], wireTo("clip_Keys_1", "midi"));
  const clip = g.nodes.clip_Keys_1!;
  assert.deepEqual(clip.inputs.notes, [
    { id: "clip_Keys_1_n1", pitch: 60, start: 0, dur: 1, vel: 0.8 },
    { id: "clip_Keys_1_n2", pitch: 64, start: 1, dur: 1, vel: 0.8 },
  ]);
  assert.deepEqual(clip.meta, { sources: { "note:clip_Keys_1_n1": 9 } });
  assert.equal(pitchOf("F#3"), 54);
  assert.equal(pitchName(61), "C#4");
  const song = (...children: unknown[]) => () => declarationOf({ default: jsx("song", { children: [jsx("track", { children })] }) });
  assert.throws(song(jsx("clip", {})), /need a <synth>/);
  assert.throws(song(jsx("synth", {}), jsx("clip", { children: [jsx("note", { pitch: "H2" })] })), /pitch is a MIDI number/);
  assert.throws(song(jsx("sampler", {})), /<sampler> names its sound file/);
});

test("a <song> holds audio clips (a sound file by path, played by the track's player), a sampler and a cycle", () => {
  const tree = jsx("song", {
    cycleStart: 4,
    cycleEnd: 12,
    children: [
      jsx("track", {
        name: "Tone",
        children: [jsx("gain", { gain: 0.5 }), jsx("clip", { src: "media/tone.wav", start: 2, length: 3, in: 0.25, volume: 0.8, __source: 7 }), jsx("clip", { src: "media/tone.wav", name: "Again", start: 8 })],
      }),
      jsx("track", { name: "Bells", children: [jsx("sampler", { src: "media/tone.wav", root: "C5", release: 1, __source: 8 }), jsx("clip", { children: [jsx("note", { pitch: "E5" })] })] }),
    ],
  });
  const { graph: g } = declarationOf({ default: tree });
  assert.deepEqual(g.nodes.master!.inputs.cycle, { start: 4, end: 12 });
  assert.deepEqual(g.nodes.player_Tone!.inputs, { name: "Tone", "audio.1": wireTo("clip_tone", "audio"), "audio.2": wireTo("clip_Again", "audio") });
  assert.deepEqual(g.nodes.fx_Tone_gain!.inputs.audio, wireTo("player_Tone", "audio"), "the chain runs player → effects → track");
  assert.deepEqual(g.nodes.clip_tone!.inputs, { name: "tone", src: "media/tone.wav", start: 2, length: 3, offsetSeconds: 0.25, gain: 0.8, loop: false });
  assert.deepEqual(g.nodes.clip_tone!.meta, { source: 7 });
  assert.deepEqual(g.nodes.inst_Bells!.inputs.spec, { kind: "sampler", src: "media/tone.wav", baseNote: 72, gain: 1, env: { attack: 0.01, decay: 0.15, sustain: 0.6, release: 1 } });
  assert.deepEqual(g.nodes.inst_Bells!.inputs["midi.1"], wireTo("clip_Bells_1", "midi"));
  const song = (props: Record<string, unknown>, ...children: unknown[]) => () => declarationOf({ default: jsx("song", { ...props, children: [jsx("track", { children })] }) });
  assert.throws(song({}, jsx("clip", { src: "/abs/tone.wav" })), /relative to this file/);
  assert.throws(song({}, jsx("clip", { src: "take.mp4" })), /not a sound file/);
  assert.throws(song({}, jsx("synth", {}), jsx("clip", { src: "tone.wav" })), /an audio clip \(src\) goes on a track without one/);
  assert.throws(song({}, jsx("clip", { src: "tone.wav" }), jsx("clip", {})), /need a <synth> or a <sampler>/);
  assert.throws(song({}, jsx("sampler", { src: "a.wav", root: "Q" })), /root is the pitch/);
  assert.throws(song({ cycleStart: 4 }), /names both/);
  assert.throws(song({ cycleStart: 4, cycleEnd: 4 }), /comes after/);
});

test("a video says a clip's crop, a LUT by file, transition settings, audio effects (clip, track, master) and a bezier key", () => {
  const g = declarationOf({
    default: jsx("video", {
      children: [
        jsx("track", {
          name: "V1",
          children: [
            jsx("clip", {
              src: "a.mp4",
              out: 2,
              cropLeft: 0.1,
              children: [
                jsx("transition", { kind: "iris", duration: 1, align: "end", shape: 2 }),
                jsx("effect", { type: "lut", src: "looks/a.cube", amount: 0.5 }),
                jsx("delay", { time: 0.2 }),
                jsx("keyframe", { property: "opacity", time: 0, value: 1, easing: "bezier", bezier: [0.4, 0, 0.2, 1] }),
              ],
            }),
            jsx("distortion", { amount: 0.2 }),
          ],
        }),
        jsx("reverb", { mix: 0.1, enabled: false }),
      ],
    }),
  }).graph;
  const clip = g.nodes["clip_a.mp4"]!;
  assert.deepEqual(clip.inputs.crop, { top: 0, right: 0, bottom: 0, left: 0.1 });
  assert.deepEqual(clip.inputs.transitionIn, { kind: "iris", duration: 1, params: { align: "end", shape: 2 } });
  assert.deepEqual(clip.inputs.effects, [{ id: "fx_lut", type: "lut", enabled: true, params: { amount: 0.5 }, src: "looks/a.cube" }]);
  assert.deepEqual(clip.inputs.audioEffects, [{ id: "afx_delay", type: "delay", enabled: true, params: { time: 0.2, feedback: 0.4, mix: 0.35 } }]);
  assert.deepEqual((clip.inputs.keyframes as { keys: unknown[] }[])[0]!.keys[0], { id: "kf_clip_a.mp4", time: 0, value: 1, easing: "bezier", bezier: [0.4, 0, 0.2, 1] });
  assert.deepEqual(g.nodes.track_V1!.inputs.audioEffects, [{ id: "afx_distortion", type: "distortion", enabled: true, params: { amount: 0.2, mix: 1 } }]);
  assert.deepEqual(g.nodes.composite!.inputs.masterEffects, [{ id: "afx_reverb", type: "reverb", enabled: false, params: { decay: 2, mix: 0.1 } }]);
  const video = (...children: unknown[]) => () => declarationOf({ default: jsx("video", { children: [jsx("track", { children })] }) });
  assert.throws(video(jsx("clip", { src: "a.mp4", out: 1, children: [jsx("effect", { type: "lut" })] })), /a LUT names its \.cube file/);
  assert.throws(video(jsx("title", { duration: 1, children: [jsx("eq", {})] })), /has no sound/);
  assert.throws(video(jsx("clip", { src: "a.mp4", out: 1, children: [jsx("filter", { mode: "notch" })] })), /mode is one of lowpass, highpass, bandpass/);
  assert.throws(video(jsx("clip", { src: "a.mp4", out: 1, cropTop: 0.6 })), /cropTop is at most 0\.49/);
});

test("a <composition> is another video by path (a video.instance whose frames are its clip's source); an <artboard> a drawing's page", () => {
  const g = declarationOf({
    default: jsx("video", {
      children: [
        jsx("track", {
          name: "V1",
          children: [
            jsx("composition", { src: "parts/Intro.vid.tsx", start: 1, in: 0.5, out: 2.5, inputs: { hue: 30 }, __source: 1, children: [jsx("intro", { preset: "fade", __source: 2 })] }),
            jsx("artboard", { src: "Poster.draw.tsx", start: 3, duration: 2, view: "page_2", fit: "cover", opacity: 0.5, __source: 3 }),
          ],
        }),
      ],
    }),
  }).graph;
  assert.deepEqual(g.nodes["comp_Intro.vid.tsx"], { id: "comp_Intro.vid.tsx", type: "video.instance", label: "Intro.vid.tsx", inputs: { __instance: { path: "parts/Intro.vid.tsx", name: "Intro.vid.tsx" }, hue: 30 } });
  const comp = g.nodes["clip_Intro.vid.tsx"]!;
  assert.deepEqual(comp.inputs.source, wireTo("comp_Intro.vid.tsx", "frames"));
  assert.equal(comp.inputs.kind, "video");
  assert.equal(comp.inputs.duration, 2);
  assert.equal(comp.inputs.inPoint, 0.5);
  assert.equal(comp.inputs.assetId, undefined, "a composition is no media file");
  assert.deepEqual(comp.meta, { source: 1, sources: { intro: 2 } });
  const art = g.nodes["clip_Poster.draw.tsx"]!;
  assert.equal(art.inputs.kind, "renderable");
  assert.deepEqual(art.inputs.renderable, { ref: { locator: "Poster.draw.tsx", fileKind: "drawing", representation: "auto", view: "page_2" }, fit: "cover" });
  assert.equal(art.inputs.source, null);
  assert.equal(art.inputs.opacity, 0.5);
  const cropped = declarationOf({ default: jsx("video", { children: [jsx("track", { children: [jsx("artboard", { src: "Poster.draw.tsx", duration: 2, crop: { x: 10, y: 20, width: 400, height: 300 } })] })] }) }).graph;
  assert.deepEqual((cropped.nodes["clip_Poster.draw.tsx"]!.inputs.renderable as { crop: unknown }).crop, { x: 10, y: 20, width: 400, height: 300 });
  assert.throws(() => declarationOf({ default: jsx("video", { children: [jsx("track", { children: [jsx("artboard", { src: "P.draw.tsx", duration: 2, crop: { x: 0, y: 0, width: 0, height: 3 } })] })] }) }), /crop is \{ x, y, width, height \}/);
  const given = declarationOf({ default: jsx("video", { children: [jsx("track", { children: [jsx("artboard", { src: "Poster.draw.tsx", duration: 2, inputs: { title: "Square", size: 40, dark: true } })] })] }) }).graph;
  assert.deepEqual((given.nodes["clip_Poster.draw.tsx"]!.inputs.renderable as { ref: { overrides: unknown } }).ref.overrides, { title: "Square", size: 40, dark: true }, "an artboard's inputs are its reference's overrides");
  assert.throws(() => declarationOf({ default: jsx("video", { children: [jsx("track", { children: [jsx("artboard", { src: "P.draw.tsx", duration: 2, inputs: { size: [1] } })] })] }) }), /inputs is \{ parameter: number \| text \| true\/false \}/);
  const video = (...children: unknown[]) => () => declarationOf({ default: jsx("video", { children: [jsx("track", { children })] }) });
  assert.throws(video(jsx("composition", { src: "Intro.mp4", out: 1 })), /is not another video's code/);
  assert.throws(video(jsx("composition", { src: "/x/Intro.vid.tsx", out: 1 })), /relative to this file/);
  assert.throws(video(jsx("composition", { src: "Intro.vid.tsx" })), /give its out \(or duration\)/);
  assert.throws(video(jsx("composition", { src: "Intro.vid.tsx", out: 1, inputs: { hue: "red" } })), /inputs is \{ parameter: number \}/);
  assert.throws(video(jsx("composition", { src: "Intro.vid.tsx", out: 1, children: [jsx("gain", {})] })), /has no sound/);
  assert.throws(video(jsx("artboard", { src: "Poster.png", duration: 1 })), /is not a drawing's code/);
  assert.throws(video(jsx("artboard", { src: "Poster.draw.tsx" })), /give its duration/);
  assert.throws(video(jsx("artboard", { src: "Poster.draw.tsx", duration: 1, fit: "stretch" })), /fit is one of fill, contain, cover, none/);
  assert.throws(() => declarationOf({ default: jsx("video", { children: [jsx("track", { kind: "audio", children: [jsx("artboard", { src: "P.draw.tsx", duration: 1 })] })] }) }), /an artboard goes on a video track/);
});

test("a video's own <artboard>s are other frames of it; an <override artboard> in a clip, title or effect sets what it is on that one", () => {
  const g = declarationOf({
    default: jsx("video", {
      width: 1920,
      height: 1080,
      children: [
        jsx("track", {
          name: "V1",
          children: [
            jsx("clip", {
              src: "media/wide.mp4",
              out: 4,
              __source: 1,
              children: [
                jsx("override", { artboard: "Vertical", src: "media/tall.mp4", __source: 2 }),
                jsx("effect", { type: "vignette", amount: 0.3, __source: 3, children: [jsx("override", { artboard: "Vertical", amount: 0.6, __source: 4 })] }),
              ],
            }),
            jsx("title", { text: "Hello", start: 4, duration: 2, y: 300, children: [jsx("override", { artboard: "Vertical", y: 700, scaleX: 0.8, fontSize: 64, cropLeft: 0.1, __source: 5 })] }),
          ],
        }),
        jsx("artboard", { name: "Vertical", width: 1080, height: 1920, __source: 6 }),
      ],
    }),
  }).graph;
  const composite = g.nodes.composite!;
  assert.deepEqual(composite.inputs.artboards, [{ name: "Vertical", width: 1080, height: 1920 }]);
  assert.equal((composite.meta!.sources as Record<string, unknown>)["artboard:Vertical"], 6);
  const clip = g.nodes["clip_wide.mp4"]!;
  assert.deepEqual(clip.inputs.overrides, { Vertical: { assetId: "media_tall.mp4" } }, "another media file on one artboard is named by its source");
  assert.deepEqual(g.nodes["src_media_tall.mp4"]!.inputs.__asset, { kind: "file", $file: "media/tall.mp4" });
  const fx = (clip.inputs.effects as { overrides?: unknown }[])[0]!;
  assert.deepEqual(fx.overrides, { Vertical: { params: { amount: 0.6 } } });
  assert.deepEqual(clip.meta!.sources, { "override:Vertical": 2, "effect:fx_vignette": 3, "effectOverride:fx_vignette:Vertical": 4 });
  assert.deepEqual(g.nodes.clip_Title!.inputs.overrides, { Vertical: { transform: { y: 700, scaleX: 0.8 }, crop: { left: 0.1 }, text: { fontSize: 64 } } });

  const video = (clipKids: unknown[], extra: unknown[] = [jsx("artboard", { name: "Vertical", width: 1080, height: 1920 })]) => () =>
    declarationOf({ default: jsx("video", { children: [jsx("track", { children: [jsx("title", { text: "T", duration: 1, children: clipKids })] }), ...extra] }) });
  assert.throws(video([jsx("override", { artboard: "Square", x: 1 })]), /declares no <artboard name="Square"> \(it declares "Vertical"\)/);
  assert.throws(video([jsx("override", { artboard: "Vertical" })]), /names what it sets/);
  assert.throws(video([jsx("override", { artboard: "Vertical", volume: 0.5 })]), /prop volume is not read on a <override>/);
  assert.throws(video([jsx("override", { artboard: "Vertical", x: 1 }), jsx("override", { artboard: "Vertical", y: 1 })]), /one <override> for artboard "Vertical"/);
  assert.throws(video([], [jsx("artboard", { name: "V", width: 10 })]), /give its width and height/);
  assert.throws(video([], [jsx("artboard", { src: "Poster.draw.tsx", duration: 1 })]), /an artboard of a drawing goes on a <track>/);
  assert.throws(video([], [jsx("artboard", { name: "V", width: 1, height: 1 }), jsx("artboard", { name: "V", width: 2, height: 2 })]), /two artboards are named "V"/);
  assert.throws(
    () => declarationOf({ default: jsx("video", { children: [jsx("track", { children: [jsx("clip", { src: "a.mp4", out: 1, children: [jsx("override", { artboard: "V", src: "b.png" })] })] }), jsx("artboard", { name: "V", width: 1, height: 1 })] }) }),
    /b\.png is not a video file/,
  );
});
