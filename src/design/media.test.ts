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
  assert.throws(song(jsx("sampler", {})), /<sampler> is not read on a <track>/);
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
