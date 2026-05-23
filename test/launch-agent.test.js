import assert from "node:assert/strict";
import test from "node:test";

import { buildLaunchAgentPlist, getLaunchAgentPath } from "../src/launch-agent.js";

test("launch agent path is stored in the user's LaunchAgents directory", () => {
  assert.equal(
    getLaunchAgentPath("/Users/example"),
    "/Users/example/Library/LaunchAgents/dev.macawake.keeper.plist",
  );
});

test("launch agent plist runs caffeinate with the selected assertion flags", () => {
  const plist = buildLaunchAgentPlist(["-i", "-m", "-s"]);

  assert.match(plist, /<key>Label<\/key>\s*<string>dev\.macawake\.keeper<\/string>/);
  assert.match(plist, /<string>\/usr\/bin\/caffeinate<\/string>/);
  assert.match(plist, /<string>-i<\/string>/);
  assert.match(plist, /<string>-m<\/string>/);
  assert.match(plist, /<string>-s<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
});
