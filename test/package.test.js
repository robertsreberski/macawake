import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("package exposes only the runtime files needed for a global CLI install", async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  const binPath = new URL(`../${packageJson.bin.macawake.replace(/^\.\//, "")}`, import.meta.url);
  const bin = await fs.readFile(binPath, "utf8");

  assert.equal(packageJson.name, "macawake");
  assert.equal(packageJson.type, "module");
  assert.deepEqual(packageJson.bin, { macawake: "./bin/macawake.js" });
  assert.deepEqual(packageJson.files, ["bin/", "src/", "README.md"]);
  assert.match(bin, /^#!\/usr\/bin\/env node\n/);
  await fs.access(new URL("../src/cli.js", import.meta.url));
});
