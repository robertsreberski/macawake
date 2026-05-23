import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { stripAnsi } from "../src/theme.js";

const ANSI_PATTERN = /\x1b\[[0-9;]*m/;

test("dry-run server prints keeper and pmset commands without executing them", async () => {
  const calls = [];
  const result = await runCli(["server", "--dry-run"], {
    env: { HOME: "/Users/example", USER: "example" },
    runner: async (command, args) => {
      calls.push([command, args]);
      return { stdout: "", stderr: "", code: 0 };
    },
    fs: fakeFs(),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 0);
  assert.match(result.stdout, /DRY RUN/);
  assert.match(result.stdout, /launchctl bootstrap gui\/501/);
  assert.match(result.stdout, /sudo pmset -a sleep 0/);
});

test("dry-run server groups actions and can render color", async () => {
  const calls = [];
  const result = await runCli(["server", "--dry-run", "--color"], {
    env: { HOME: "/Users/example", USER: "example" },
    runner: async (command, args) => {
      calls.push([command, args]);
      return { stdout: "", stderr: "", code: 0 };
    },
    fs: fakeFs(),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 0);
  const plain = stripAnsi(result.stdout);
  assert.match(result.stdout, ANSI_PATTERN);
  assert.match(plain, /DRY RUN/);
  assert.match(plain, /Actions/);
  assert.match(plain, /\[run\]\s+launchctl bootstrap gui\/501/);
  assert.match(plain, /Mode set: server/);
});

test("aggressive dry-run on battery fails unless force flag is supplied", async () => {
  const result = await runCli(["aggressive", "--dry-run"], {
    env: { HOME: "/Users/example", USER: "example" },
    runner: async (command, args) => {
      if (command === "pmset" && args.join(" ") === "-g batt") {
        return { stdout: "Now drawing from 'Battery Power'\n", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    },
    fs: fakeFs(),
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /requires AC power/);
});

test("status reports power, keeper, tailscale, ssh, and listener summaries", async () => {
  const result = await runCli(["status"], statusDeps());

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Power\n/);
  assert.match(result.stdout, /Power source\s+AC Power/);
  assert.match(result.stdout, /\[ok\]\s+Keeper\s+running/);
  assert.match(result.stdout, /\[ok\]\s+Tailscale\s+Running, online, macawake\.tailnet\.ts\.net/);
  assert.match(result.stdout, /\[ok\]\s+SSH\s+listening/);
  assert.match(result.stdout, /127\.0\.0\.1:7878/);
});

test("mode changes do not print or persist absolute home paths", async () => {
  const files = new Map();
  const result = await runCli(["server"], {
    env: { HOME: "/Users/alice", USER: "alice" },
    runner: async () => ({ stdout: "", stderr: "", code: 0 }),
    fs: capturingFs(files),
  });

  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(result.stdout, /\/Users\/alice/);
  assert.match(result.stdout, /~\/Library\/LaunchAgents\/dev\.macawake\.keeper\.plist/);
  assert.match(result.stdout, /~\/\.config\/macawake\/state\.json/);

  const state = JSON.parse(files.get("/Users/alice/.config/macawake/state.json"));
  assert.equal(state.mode, "server");
  assert.equal(typeof state.updatedAt, "string");
  assert.deepEqual(Object.keys(state).sort(), ["mode", "updatedAt"]);
});

test("status prints the macawake mode before diagnostic sections", async () => {
  const result = await runCli(["status"], statusDeps({}, {
    "/Users/example/.config/macawake/state.json": JSON.stringify({
      mode: "server",
      updatedAt: "2026-05-18T12:00:00.000Z",
      launchAgentPath: "/Users/example/Library/LaunchAgents/dev.macawake.keeper.plist",
    }),
  }));

  assert.equal(result.exitCode, 0);
  const plain = stripAnsi(result.stdout);
  assert.match(plain, /Macawake\n/);
  assert.match(plain, /\[ok\]\s+Status\s+server \(keeper running\)/);
  assert.ok(plain.indexOf("Macawake\n") < plain.indexOf("Power\n"));
});

test("status json omits local filesystem paths from saved state", async () => {
  const result = await runCli(["status", "--json"], statusDeps(
    { HOME: "/Users/alice", USER: "alice" },
    {
      "/Users/alice/.config/macawake/state.json": JSON.stringify({
        mode: "server",
        updatedAt: "2026-05-18T12:00:00.000Z",
        launchAgentPath: "/Users/alice/Library/LaunchAgents/dev.macawake.keeper.plist",
      }),
    },
  ));

  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(result.stdout, /\/Users\/alice/);
  const status = JSON.parse(result.stdout);
  assert.equal(status.macawake.mode, "server");
  assert.equal(status.macawake.launchAgentPath, undefined);
  assert.equal(status.macawake.statePath, undefined);
  assert.equal(status.macawake.error, undefined);
});

test("status can render structured color output", async () => {
  const result = await runCli(["status", "--color"], statusDeps());

  assert.equal(result.exitCode, 0);
  const plain = stripAnsi(result.stdout);
  assert.match(result.stdout, ANSI_PATTERN);
  assert.match(plain, /Power\n/);
  assert.match(plain, /Services\n/);
  assert.match(plain, /\[ok\]\s+Keeper\s+running/);
  assert.match(plain, /COMMAND\s+PID\s+ADDRESS/);
  assert.match(plain, /node\s+59474\s+127\.0\.0\.1:7878/);
});

test("status can render structured plain output without color", async () => {
  const result = await runCli(["status", "--no-color"], statusDeps());

  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(result.stdout, ANSI_PATTERN);
  assert.match(result.stdout, /Power\n/);
  assert.match(result.stdout, /\[ok\]\s+Keeper\s+running/);
});

test("status json stays uncolored even when color is forced", async () => {
  const result = await runCli(["status", "--json", "--color"], statusDeps());

  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(result.stdout, ANSI_PATTERN);
  assert.equal(JSON.parse(result.stdout).powerSource, "AC Power");
});

test("status uses automatic terminal color unless disabled by environment", async () => {
  const ttyResult = await runCli(["status"], {
    ...statusDeps(),
    stdout: { isTTY: true },
  });
  const noColorResult = await runCli(["status"], {
    ...statusDeps({ NO_COLOR: "1" }),
    stdout: { isTTY: true },
  });
  const dumbTermResult = await runCli(["status"], {
    ...statusDeps({ TERM: "dumb" }),
    stdout: { isTTY: true },
  });

  assert.match(ttyResult.stdout, ANSI_PATTERN);
  assert.doesNotMatch(noColorResult.stdout, ANSI_PATTERN);
  assert.doesNotMatch(dumbTermResult.stdout, ANSI_PATTERN);
});

function statusDeps(env = {}, files = {}) {
  return {
    env: { HOME: "/Users/example", USER: "example", ...env },
    runner: async (command, args) => {
      const key = `${command} ${args.join(" ")}`;
      if (key === "pmset -g custom") {
        return {
          stdout: "Battery Power:\n sleep                10\nAC Power:\n sleep                30\n",
          stderr: "",
          code: 0,
        };
      }
      if (key === "pmset -g batt") {
        return { stdout: "Now drawing from 'AC Power'\n", stderr: "", code: 0 };
      }
      if (key === "pmset -g assertions") {
        return { stdout: "Assertion status system-wide:\n PreventSystemSleep 0\n", stderr: "", code: 0 };
      }
      if (key.endsWith("Tailscale status --json")) {
        return {
          stdout: JSON.stringify({
            BackendState: "Running",
            Self: { DNSName: "macawake.tailnet.ts.net.", TailscaleIPs: ["100.1.2.3"], Online: true },
            Health: [],
          }),
          stderr: "",
          code: 0,
        };
      }
      if (key === "lsof -nP -iTCP:22 -sTCP:LISTEN") {
        return { stdout: "ssh 123 user 6u IPv4 abc 0t0 TCP *:22 (LISTEN)\n", stderr: "", code: 0 };
      }
      if (key === "lsof -nP -iTCP -sTCP:LISTEN") {
        return {
          stdout: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 59474 user 15u IPv4 abc 0t0 TCP 127.0.0.1:7878 (LISTEN)\n",
          stderr: "",
          code: 0,
        };
      }
      if (key === "launchctl print gui/501/dev.macawake.keeper") {
        return { stdout: "state = running\n", stderr: "", code: 0 };
      }
      throw new Error(`Unexpected command: ${key}`);
    },
    fs: fakeFs(files),
  };
}

function capturingFs(files = new Map()) {
  return {
    mkdir: async () => {},
    writeFile: async (path, contents) => {
      files.set(path, contents);
    },
    rm: async (path) => {
      files.delete(path);
    },
    readFile: async (path) => {
      if (!files.has(path)) {
        const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
        error.code = "ENOENT";
        throw error;
      }
      return files.get(path);
    },
  };
}

function fakeFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  return {
    mkdir: async () => {},
    writeFile: async (path, contents) => {
      files.set(path, contents);
    },
    rm: async (path) => {
      files.delete(path);
    },
    readFile: async (path) => {
      if (!files.has(path)) {
        const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
        error.code = "ENOENT";
        throw error;
      }
      return files.get(path);
    },
  };
}
