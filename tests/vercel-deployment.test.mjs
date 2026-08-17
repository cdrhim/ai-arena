import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

test("Vercel publishes the tested static site and preserves the Arena SPA routes", () => {
  assert.equal(config.buildCommand, "node --test tests/vercel-deployment.test.mjs");
  assert.equal(config.outputDirectory, "public");
  assert.deepEqual(
    config.rewrites.filter((rule) => rule.source.startsWith("/arena")),
    [
      { source: "/arena", destination: "/arena/index.html" },
      { source: "/arena/:path*", destination: "/arena/index.html" }
    ]
  );
});

test("Vercel keeps authenticated API calls same-origin through the production backend", () => {
  const apiRewrite = config.rewrites.find((rule) => rule.source === "/api/:path*");
  assert.deepEqual(apiRewrite, {
    source: "/api/:path*",
    destination: "https://sparkclaw-arena.netlify.app/api/:path*"
  });
});
