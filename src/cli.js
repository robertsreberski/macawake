import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildLaunchAgentPlist,
  getLaunchAgentPath,
  getLaunchctlTarget,
} from "./launch-agent.js";
import { buildModePlan, KEEPER_LABEL, SUPPORTED_MODES } from "./modes.js";
import { parsePmsetBattSource } from "./parsers.js";
import { formatCommand, runCommand } from "./runner.js";
import { collectStatus, formatStatus } from "./status.js";
import { createTheme, padEndVisible, shouldUseColor } from "./theme.js";

export async function runCli(argv, deps = {}) {
  const { command, flags } = parseArgs(argv);
  const runner = deps.runner ?? runCommand;
  const env = deps.env ?? process.env;
  const fsApi = deps.fs ?? fs;
  const uid = deps.uid ?? process.getuid?.();
  const home = env.HOME ?? os.homedir();
  const theme = createTheme({
    color: shouldUseColor({ flags, env, stdout: deps.stdout ?? process.stdout }),
  });

  try {
    if (flags.has("--help") || command === "help" || command === "--help" || command === "-h") {
      return ok(formatHelp(theme));
    }

    if (command === "status") {
      const status = await collectStatus({ runner, env, fs: fsApi, uid });
      if (flags.has("--json")) {
        return ok(`${JSON.stringify(status, null, 2)}\n`);
      }
      return ok(formatStatus(status, theme));
    }

    if (!SUPPORTED_MODES.includes(command)) {
      return fail(`${theme.badge("warn")} Unsupported command: ${theme.error(command)}\n\n${formatHelp(theme)}`);
    }

    const dryRun = flags.has("--dry-run");
    const forceBattery = flags.has("--force-battery");
    const powerSource = command === "aggressive"
      ? await getPowerSource(runner, dryRun)
      : undefined;

    const plan = buildModePlan(command, { forceBattery, powerSource });
    const executor = new Executor({
      dryRun,
      env,
      fs: fsApi,
      home,
      runner,
      theme,
      uid,
    });

    const lines = [
      theme.title(`macawake ${command}`),
      "",
    ];
    if (dryRun) lines.push(`${theme.badge("warn")} ${theme.warning("DRY RUN")} - no changes will be applied.`);
    if (plan.warning) lines.push(`${theme.badge("warn")} ${theme.warning(plan.warning)}`);
    if (command === "light") {
      lines.push(`${theme.badge("warn")} ${theme.warning("Light mode prioritizes battery life over sleep-time SSH/HTTP availability.")}`);
    }
    lines.push("");
    lines.push(theme.section("Actions"));

    if (plan.keeperAction === "stop") {
      await executor.stopKeeper(lines);
    } else if (plan.keeperAction === "start") {
      await executor.startKeeper(plan.keeper.caffeinateArgs, lines);
    }

    for (const profileCommand of plan.profileCommands) {
      await executor.run(profileCommand.command, profileCommand.args, { lines });
    }

    await executor.writeState({ mode: command }, lines);
    lines.push("");
    lines.push(`${theme.badge("ok")} Mode set: ${command}`);
    return ok(`${lines.join("\n")}\n`);
  } catch (error) {
    return fail(`${error.message}\n`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const result = await runCli(argv);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

class Executor {
  constructor({ dryRun, env, fs, home, runner, theme, uid }) {
    this.dryRun = dryRun;
    this.env = env;
    this.fs = fs;
    this.home = home;
    this.runner = runner;
    this.theme = theme;
    this.uid = uid;
  }

  async startKeeper(caffeinateArgs, lines) {
    const launchAgentPath = getLaunchAgentPath(this.home);
    const launchAgentsDir = path.dirname(launchAgentPath);
    const domain = `gui/${this.uid}`;
    const target = getLaunchctlTarget(this.uid);

    await this.mkdir(launchAgentsDir, lines);
    await this.writeFile(launchAgentPath, buildLaunchAgentPlist(caffeinateArgs), lines);
    await this.run("launchctl", ["bootout", target], { lines, optional: true });
    await this.run("launchctl", ["bootstrap", domain, launchAgentPath], { lines });
    await this.run("launchctl", ["enable", target], { lines });
    await this.run("launchctl", ["kickstart", "-k", target], { lines });
  }

  async stopKeeper(lines) {
    const launchAgentPath = getLaunchAgentPath(this.home);
    const target = getLaunchctlTarget(this.uid);

    await this.run("launchctl", ["bootout", target], { lines, optional: true });
    await this.rm(launchAgentPath, lines);
  }

  async run(command, args, { lines, optional = false }) {
    const formattedCommand = this.formatCommandForDisplay(command, args);
    lines.push(this.actionLine("run", formattedCommand));
    if (this.dryRun) return;

    const result = await this.runner(command, args);
    if (result.code !== 0 && !optional) {
      const detail = result.stderr || result.stdout || `exit code ${result.code}`;
      throw new Error(`Command failed: ${formattedCommand}\n${detail.trim()}`);
    }
  }

  async mkdir(dir, lines) {
    lines.push(this.actionLine("write", this.formatCommandForDisplay("mkdir", ["-p", dir])));
    if (!this.dryRun) {
      await this.fs.mkdir(dir, { recursive: true });
    }
  }

  async writeFile(filePath, contents, lines) {
    lines.push(this.actionLine("write", this.displayPath(filePath)));
    if (!this.dryRun) {
      await this.fs.writeFile(filePath, contents, "utf8");
    }
  }

  async rm(filePath, lines) {
    lines.push(this.actionLine("write", this.formatCommandForDisplay("rm", ["-f", filePath])));
    if (!this.dryRun) {
      await this.fs.rm(filePath, { force: true });
    }
  }

  async writeState(state, lines) {
    const stateDir = path.join(this.home, ".config", "macawake");
    const statePath = path.join(stateDir, "state.json");
    const contents = JSON.stringify(
      {
        ...state,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    );

    lines.push(this.actionLine("write", this.displayPath(statePath)));
    if (!this.dryRun) {
      await this.fs.mkdir(stateDir, { recursive: true });
      await this.fs.writeFile(statePath, `${contents}\n`, "utf8");
    }
  }

  actionLine(kind, value) {
    return `  ${padEndVisible(this.theme.badge(kind), 8)} ${this.theme.command(value)}`;
  }

  formatCommandForDisplay(command, args) {
    return formatCommand(command, args.map((arg) => this.displayPath(arg)));
  }

  displayPath(value) {
    if (typeof value !== "string" || this.home.length === 0) return value;
    if (value === this.home) return "~";
    if (value.startsWith(`${this.home}${path.sep}`)) {
      return `~/${value.slice(this.home.length + 1)}`;
    }
    return value;
  }
}

async function getPowerSource(runner, dryRun) {
  const result = await runner("pmset", ["-g", "batt"]);
  if (result.code !== 0) {
    throw new Error(`Unable to determine power source: ${(result.stderr || result.stdout).trim()}`);
  }
  const source = parsePmsetBattSource(result.stdout);
  if (dryRun && source === "Unknown") return "AC Power";
  return source;
}

function ok(stdout) {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr) {
  return { exitCode: 1, stdout: "", stderr };
}

function parseArgs(argv) {
  const flags = new Set();
  let command;

  for (const arg of argv) {
    if (arg.startsWith("-")) {
      flags.add(arg);
    } else if (!command) {
      command = arg;
    }
  }

  return { command: command ?? "help", flags };
}

function formatHelp(theme) {
  const modeDescriptions = [
    ["default", "Stop macawake keep-awake and restore normal battery/AC sleep timers."],
    ["light", "Stop keep-awake and apply maximum battery-saving settings on battery."],
    ["server", "Keep the Mac awake for local SSH/HTTP services while open or in supported clamshell use."],
    ["aggressive", "AC-only closed-lid/no-monitor attempt using caffeinate plus pmset disablesleep."],
  ];
  const modeWidth = Math.max(...modeDescriptions.map(([mode]) => mode.length));

  return `${[
    `${theme.title("macawake")} - switch macOS power profiles`,
    "",
    theme.section("Usage"),
    `  ${theme.command("macawake status [--json] [--color|--no-color]")}`,
    `  ${theme.command("macawake default [--dry-run] [--color|--no-color]")}`,
    `  ${theme.command("macawake light [--dry-run] [--color|--no-color]")}`,
    `  ${theme.command("macawake server [--dry-run] [--color|--no-color]")}`,
    `  ${theme.command("macawake aggressive [--dry-run] [--force-battery] [--color|--no-color]")}`,
    "",
    theme.section("Modes"),
    ...modeDescriptions.map(([mode, description]) => (
      `  ${padEndVisible(theme.value(mode), modeWidth)}  ${description}`
    )),
    "",
    theme.section("Notes"),
    "  Mode switching does not enable or disable SSH, Tailscale, or Tailscale Serve.",
    "  Use --dry-run to print commands without changing settings.",
  ].join("\n")}\n`;
}

export { KEEPER_LABEL };
