import assert from "node:assert/strict";
import test from "node:test";

import {
  AGGRESSIVE_WARNING,
  buildModePlan,
  getProfileCommands,
} from "../src/modes.js";

test("light mode applies travel battery saving and normal AC settings", () => {
  const commands = getProfileCommands("light");

  assert.deepEqual(commands, [
    {
      command: "sudo",
      args: [
        "pmset",
        "-b",
        "hibernatemode",
        "25",
        "sleep",
        "1",
        "displaysleep",
        "2",
        "standby",
        "1",
        "powernap",
        "0",
        "tcpkeepalive",
        "0",
        "ttyskeepawake",
        "1",
        "womp",
        "0",
        "lessbright",
        "1",
        "disksleep",
        "10",
      ],
    },
    {
      command: "sudo",
      args: [
        "pmset",
        "-c",
        "hibernatemode",
        "3",
        "sleep",
        "30",
        "displaysleep",
        "10",
        "standby",
        "1",
        "powernap",
        "1",
        "tcpkeepalive",
        "1",
        "ttyskeepawake",
        "1",
        "womp",
        "1",
        "disksleep",
        "10",
      ],
    },
    {
      command: "sudo",
      args: ["pmset", "-a", "disablesleep", "0"],
    },
  ]);
});

test("server mode disables automatic system sleep without enabling disablesleep", () => {
  const commands = getProfileCommands("server");

  assert.deepEqual(commands, [
    {
      command: "sudo",
      args: [
        "pmset",
        "-a",
        "sleep",
        "0",
        "hibernatemode",
        "3",
        "powernap",
        "1",
        "tcpkeepalive",
        "1",
        "ttyskeepawake",
        "1",
        "womp",
        "1",
        "disksleep",
        "10",
      ],
    },
    {
      command: "sudo",
      args: ["pmset", "-a", "disablesleep", "0"],
    },
  ]);
});

test("aggressive mode requires AC unless forced and includes explicit warning", () => {
  assert.throws(
    () => buildModePlan("aggressive", { powerSource: "Battery Power" }),
    /requires AC power/,
  );

  const plan = buildModePlan("aggressive", {
    forceBattery: true,
    powerSource: "Battery Power",
  });

  assert.equal(plan.warning, AGGRESSIVE_WARNING);
  assert.deepEqual(plan.profileCommands.at(-1), {
    command: "sudo",
    args: ["pmset", "-a", "disablesleep", "1"],
  });
});

test("default and light modes stop the caffeinate keeper", () => {
  assert.equal(buildModePlan("default").keeperAction, "stop");
  assert.equal(buildModePlan("light").keeperAction, "stop");
});

test("server and aggressive modes start the expected caffeinate keeper", () => {
  assert.deepEqual(buildModePlan("server").keeper, {
    label: "dev.macawake.keeper",
    caffeinateArgs: ["-i", "-m"],
  });
  assert.deepEqual(buildModePlan("aggressive", { powerSource: "AC Power" }).keeper, {
    label: "dev.macawake.keeper",
    caffeinateArgs: ["-i", "-m", "-s"],
  });
});
