import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/cinematic.css", import.meta.url), "utf8");
const client = await readFile(new URL("../public/cinematic.js", import.meta.url), "utf8");
const netlify = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");

test("the root URL opens a cinematic SparkClaw film instead of immediately redirecting", () => {
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  assert.match(html, /id="cinematicFilm"[\s\S]*?autoplay[\s\S]*?muted[\s\S]*?loop[\s\S]*?playsinline/);
  assert.match(html, /poster="\/media\/sparkclaw-cinematic-poster\.jpg"/);
  assert.match(html, /src="\/media\/sparkclaw-cinematic-intro\.mp4" type="video\/mp4"/);
  assert.match(netlify, /from = "\/"\s+to = "\/index\.html"\s+status = 200\s+force = true/);
});

test("the whole cinematic screen provides an accessible, animated Arena entrance", () => {
  assert.match(html, /id="cinematicEnter"[\s\S]*?aria-label="AI Arena 랜딩 페이지로 입장"/);
  assert.match(html, /class="cinematic-skip" href="\/arena\/"/);
  assert.match(client, /entryButton\?\.addEventListener\("click", enterArena\)/);
  assert.match(client, /document\.body\.classList\.add\("is-entering"\)/);
  assert.match(client, /window\.location\.assign\(ARENA_URL\)/);
  assert.match(css, /body\.is-entering \.cinematic-film[\s\S]*?transform: scale\(1\.13\)/);
  assert.match(css, /body\.is-entering \.cinematic-transition[\s\S]*?opacity: 1/);
});

test("autoplay and responsive fallbacks keep the entry usable", () => {
  assert.match(client, /film\?\.play\(\)\.catch/);
  assert.match(client, /window\.addEventListener\("pageshow", resetCinematicEntry\)/);
  assert.match(css, /@media \(orientation: portrait\)[\s\S]*?\.cinematic-film[\s\S]*?object-fit: contain/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.cinematic-film[\s\S]*?display: none/);
});

test("the web-optimized film stays small enough for an entry experience", async () => {
  const video = await stat(new URL("../public/media/sparkclaw-cinematic-intro.mp4", import.meta.url));
  const poster = await stat(new URL("../public/media/sparkclaw-cinematic-poster.jpg", import.meta.url));
  assert.ok(video.size > 1_000_000);
  assert.ok(video.size < 7_000_000);
  assert.ok(poster.size > 10_000);
  assert.ok(poster.size < 250_000);
});
