import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLsofListeners,
  parsePmsetBattSource,
  parsePmsetCustom,
  parseTailscaleStatus,
} from "../src/parsers.js";

test("parsePmsetCustom reads battery and AC settings into sections", () => {
  const parsed = parsePmsetCustom(`Battery Power:
 hibernatemode        25
 powernap             0
 sleep                1
AC Power:
 hibernatemode        3
 sleep                30
 tcpkeepalive         1
`);

  assert.equal(parsed["Battery Power"].hibernatemode, "25");
  assert.equal(parsed["Battery Power"].powernap, "0");
  assert.equal(parsed["AC Power"].sleep, "30");
  assert.equal(parsed["AC Power"].tcpkeepalive, "1");
});

test("parsePmsetBattSource reports the active power source", () => {
  assert.equal(parsePmsetBattSource("Now drawing from 'AC Power'\n"), "AC Power");
  assert.equal(parsePmsetBattSource("Now drawing from 'Battery Power'\n"), "Battery Power");
});

test("parseTailscaleStatus summarizes running and stopped states", () => {
  assert.deepEqual(
    parseTailscaleStatus(
      JSON.stringify({
        BackendState: "Running",
        Self: {
          DNSName: "macawake.tailnet.ts.net.",
          TailscaleIPs: ["100.64.103.59"],
          Online: true,
        },
        Health: [],
      }),
    ),
    {
      backendState: "Running",
      dnsName: "macawake.tailnet.ts.net",
      ips: ["100.64.103.59"],
      online: true,
      health: [],
    },
  );

  assert.deepEqual(parseTailscaleStatus("Tailscale is stopped."), {
    backendState: "Unknown",
    dnsName: null,
    ips: [],
    online: false,
    health: ["Tailscale is stopped."],
  });
});

test("parseLsofListeners extracts listener command, pid, and address", () => {
  const listeners = parseLsofListeners(`COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    59474 user   15u  IPv4 abc    0t0      TCP 127.0.0.1:7878 (LISTEN)
ssh     25285 user    6u  IPv4 def    0t0      TCP *:22 (LISTEN)
`);

  assert.deepEqual(listeners, [
    { command: "node", pid: 59474, address: "127.0.0.1:7878" },
    { command: "ssh", pid: 25285, address: "*:22" },
  ]);
});
