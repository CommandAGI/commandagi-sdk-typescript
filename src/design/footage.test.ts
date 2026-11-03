// A film compiled from its shot list. Pinned here: a diffusion clip's key changes with each input the model is given
// (and only with those), so a cached clip is made again only when it must; a real shot whose take is missing
// becomes a task and shows its fallback; the compiled video is one the media reader accepts, with lines timed by
// their voices.
import assert from "node:assert/strict";
import { test } from "node:test";

import { compileFilm, declarationOf, diffusionKey, footagePath, printElement, type Film } from "./index.js";

const shape = { width: 1920, height: 1080, fps: 24, duration: 4 };
const spec = { model: "m/video", prompt: "a hat on black", seed: 7, refs: ["refs/a.png"] };
const refs = { "refs/a.png": new Uint8Array([1, 2, 3]) };

test("a diffusion key changes with every input the model is given, and with nothing else", async () => {
  const key = await diffusionKey(spec, shape, refs);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(await diffusionKey({ ...spec }, { ...shape }, { "refs/a.png": new Uint8Array([1, 2, 3]) }), key, "the same inputs name the same clip");
  assert.equal(await diffusionKey({ seed: 7, prompt: "a hat on black", refs: ["refs/a.png"], model: "m/video" }, shape, refs), key, "the order of the spec's keys does not count");
  assert.equal(await diffusionKey({ ...spec, refs: ["refs/b.png"] }, shape, { "refs/b.png": new Uint8Array([1, 2, 3]) }), key, "a reference counts by its bytes, not its name");
  const changed = [
    await diffusionKey({ ...spec, prompt: "a hat on white" }, shape, refs),
    await diffusionKey({ ...spec, seed: 8 }, shape, refs),
    await diffusionKey({ ...spec, model: "m/video-2" }, shape, refs),
    await diffusionKey(spec, shape, { "refs/a.png": new Uint8Array([1, 2, 4]) }),
    await diffusionKey({ ...spec, params: { motion: 0.5 } }, shape, refs),
    await diffusionKey(spec, { ...shape, duration: 4.5 }, refs),
    await diffusionKey(spec, { ...shape, width: 1280, height: 720 }, refs),
  ];
  for (const k of changed) assert.notEqual(k, key);
  assert.equal(new Set(changed).size, changed.length);
  await assert.rejects(diffusionKey(spec, shape, {}), /refs\/a\.png was not read/);
});

const film: Film = {
  name: "Launch",
  width: 1920,
  height: 1080,
  fps: 24,
  mode: "synth3d",
  music: { src: "audio/score.wav", volume: 0.5 },
  loudness: { target: -16, peak: -1 },
  shots: [
    {
      id: "a1",
      name: "speaker",
      onCamera: true,
      lead: 2,
      gap: 0.5,
      tail: 1,
      lines: [{ id: "l1", text: "Hello." }, { id: "l2", text: "Again." }],
      synth3d: { scene: "speaker" },
      real: { framing: "medium close-up, centred", props: ["the hat"] },
    },
    { id: "b1", duration: 4, title: { text: "launch" }, synth3d: { scene: "turntable" }, diffusion: spec, real: { framing: "macro" } },
  ],
};

test("a film compiles to a timeline timed by its voices, with the jobs that make its footage", () => {
  const out = compileFilm(film, { lineSeconds: { l1: 1.2, l2: 0.8 }, has: (p) => p === "footage/synth3d/b1.mp4" });
  assert.deepEqual(out.shots.map((s) => [s.id, s.start, s.duration, s.src]), [
    ["a1", 0, 5.5, "footage/synth3d/a1.mp4"],
    ["b1", 5.5, 4, "footage/synth3d/b1.mp4"],
  ]);
  assert.deepEqual(out.shots[0]!.lines.map((l) => [l.id, l.start, l.duration, l.src]), [
    ["l1", 2, 1.2, "voice/l1.wav"],
    ["l2", 3.7, 0.8, "voice/l2.wav"],
  ]);
  assert.equal(out.duration, 9.5);
  assert.deepEqual(out.jobs.map((j) => [j.shot, j.mode, j.cached]), [["a1", "synth3d", false], ["b1", "synth3d", true]]);
  assert.deepEqual(out.tasks, []);

  // The video is one the media reader accepts: footage on V1 (silent), the title, each voice line, the score.
  const { graph } = declarationOf({ default: () => out.video });
  const files = Object.values(graph.nodes).flatMap((n) => {
    const a = (n.inputs as { __asset?: { $file?: string } }).__asset;
    return a?.$file ? [a.$file] : [];
  });
  assert.deepEqual(files.sort(), ["audio/score.wav", "footage/synth3d/a1.mp4", "footage/synth3d/b1.mp4", "voice/l1.wav", "voice/l2.wav"]);
  assert.match(out.vid, /^\/\/ Launch: compiled from its shot list/);
  assert.ok(out.vid.includes('<title text="launch" start={5.5} duration={4} fontSize={60} color="#e8e8e8" />'), out.vid);
  assert.ok(out.vid.includes(printElement(out.video, 1)));
  assert.ok(out.vid.indexOf('<track name="Titles">') < out.vid.indexOf('<track name="V1">'), "the titles are in front of the footage");
  assert.ok(out.vid.includes("<loudness target={-16} peak={-1} />"));
});

test("a real shot whose take is missing becomes a task and shows its fallback; an uploaded take is used", () => {
  const modes = { "*": "real" as const };
  const out = compileFilm(film, { lineSeconds: { l1: 1.2, l2: 0.8 }, has: (p) => p === "footage/real/b1.mp4", modes });
  assert.deepEqual(out.shots.map((s) => [s.id, s.mode, s.shows, s.src]), [
    ["a1", "real", "synth3d", "footage/synth3d/a1.mp4"],
    ["b1", "real", "real", "footage/real/b1.mp4"],
  ]);
  assert.deepEqual(out.tasks.map((t) => [t.shot, t.path, t.readmePath]), [["a1", "tasks/a1.task.tsx", "tasks/a1.md"]]);
  const t = out.tasks[0]!;
  assert.ok(t.tsx.includes('<task id="film-launch-a1" title="Record shot a1 of Launch: speaker" status="todo"'), t.tsx);
  assert.ok(t.tsx.includes('readme="a1.md"'));
  for (const s of ["**Upload to:** `footage/real/a1.mp4`", "medium close-up, centred", "the hat", '2.0 s in: "Hello."', "said on camera", "accept: footage/real/a1.mp4 holds a take of at least 8 s"])
    assert.ok(t.md.includes(s), `${s} in\n${t.md}`);
  assert.deepEqual(out.jobs.map((j) => [j.shot, j.mode]), [["a1", "synth3d"]], "only the fallback is made");

  // A shot with no real slot (an end card made in post) keeps its own mode under a mode for all, and asks for nothing.
  const card = { ...film, shots: [...film.shots, { id: "e1", duration: 3, synth3d: { scene: "card" } }] };
  const withCard = compileFilm(card, { lineSeconds: { l1: 1.2, l2: 0.8 }, has: () => false, modes });
  assert.deepEqual(withCard.shots.map((s) => [s.id, s.mode]), [["a1", "real"], ["b1", "real"], ["e1", "synth3d"]]);
  assert.deepEqual(withCard.tasks.map((t) => t.shot), ["a1", "b1"]);
});

test("a diffusion shot's file names its key; a shot or a mode the film cannot make is refused by name", () => {
  const key = "ab".repeat(32);
  const out = compileFilm(film, { lineSeconds: { l1: 1, l2: 1 }, has: () => false, modes: { b1: "diffusion" }, diffusionKeys: { b1: key } });
  assert.equal(out.shots[1]!.src, `footage/diffusion/b1.${key.slice(0, 16)}.mp4`);
  assert.equal(out.jobs[1]!.key, key);
  assert.throws(() => compileFilm(film, { lineSeconds: { l1: 1, l2: 1 }, has: () => false, modes: { a1: "diffusion" } }), /shot a1 has no diffusion slot/);
  assert.throws(() => compileFilm(film, { lineSeconds: { l1: 1 }, has: () => false }), /line l2 has no spoken length/);
  assert.throws(() => footagePath("b1", "diffusion"), /named by its key/);
});
