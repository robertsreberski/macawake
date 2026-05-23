import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { KEEPER_LABEL, SUPPORTED_MODES } from "./modes.js";
import {
  parseLsofListeners,
  parsePmsetBattSource,
  parsePmsetCustom,
  parseTailscaleStatus,
} from "./parsers.js";
import { createTheme, padEndVisible } from "./theme.js";

const DEFAULT_TAILSCALE_PATH = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";

export async function collectStatus({
  runner,
  env = process.env,
  fs: fsApi = fs,
  uid = process.getuid?.(),
}) {
  const home = env.HOME ?? os.homedir();
  const [
    state,
    custom,
    battery,
    assertions,
    tailscale,
    ssh,
    listeners,
    keeper,
  ] = await Promise.all([
    readMacawakeState(fsApi, home),
    safeRun(runner, "pmset", ["-g", "custom"]),
    safeRun(runner, "pmset", ["-g", "batt"]),
    safeRun(runner, "pmset", ["-g", "assertions"]),
    safeRun(runner, getTailscaleCommand(env), ["status", "--json"]),
    safeRun(runner, "lsof", ["-nP", "-iTCP:22", "-sTCP:LISTEN"]),
    safeRun(runner, "lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"]),
    safeRun(runner, "launchctl", ["print", `gui/${uid}/${KEEPER_LABEL}`]),
  ]);
  const keeperRunning = keeper.code === 0 && /state = running|active count = [1-9]/.test(keeper.stdout);

  return {
    macawake: summarizeMacawakeState(state, keeperRunning),
    powerSource: parsePmsetBattSource(battery.stdout),
    pmset: parsePmsetCustom(custom.stdout),
    assertions: assertions.stdout.trim(),
    keeperRunning,
    tailscale: parseTailscaleStatus(tailscale.stdout || tailscale.stderr),
    sshListening: ssh.code === 0 && ssh.stdout.trim().length > 0,
    listeners: parseLsofListeners(listeners.stdout),
  };
}

export function formatStatus(status, theme = createTheme()) {
  const tailscaleParts = [
    status.tailscale.backendState,
    status.tailscale.online ? "online" : "offline",
    status.tailscale.dnsName,
  ].filter(Boolean);

  const lines = [
    theme.title("macawake status"),
    "",
    theme.section("Macawake"),
    serviceRow(theme, status.macawake.status, "Status", formatMacawakeSummary(status.macawake, theme)),
    "",
    theme.section("Power"),
    detailRow(theme, "Power source", theme.value(status.powerSource)),
  ];

  const batterySleep = status.pmset["Battery Power"]?.sleep;
  const acSleep = status.pmset["AC Power"]?.sleep;
  if (batterySleep || acSleep) {
    lines.push(detailRow(
      theme,
      "Sleep timers",
      `battery=${batterySleep ?? "unknown"} min, AC=${acSleep ?? "unknown"} min`,
    ));
  }

  lines.push("");
  lines.push(theme.section("Services"));
  lines.push(serviceRow(
    theme,
    status.keeperRunning ? "ok" : "off",
    "Keeper",
    status.keeperRunning ? theme.success("running") : "stopped",
  ));
  lines.push(serviceRow(
    theme,
    status.tailscale.online ? "ok" : "off",
    "Tailscale",
    tailscaleParts.join(", ") || "unknown",
  ));
  lines.push(serviceRow(
    theme,
    status.sshListening ? "ok" : "off",
    "SSH",
    status.sshListening ? theme.success("listening") : "not listening",
  ));

  lines.push("");
  lines.push(theme.section("Listeners"));
  lines.push(...listenerRows(status.listeners, theme));

  if (status.tailscale.health.length > 0) {
    lines.push("");
    lines.push(theme.section("Health"));
    lines.push(...status.tailscale.health.map((item) => `  ${theme.badge("warn")} ${theme.warning(item)}`));
  }

  return `${lines.join("\n")}\n`;
}

function detailRow(theme, label, value) {
  return `  ${padEndVisible(theme.label(label), 13)} ${value}`;
}

function serviceRow(theme, badge, label, value) {
  return `  ${padEndVisible(theme.badge(badge), 7)} ${padEndVisible(label, 10)} ${value}`;
}

function listenerRows(listeners, theme) {
  if (listeners.length === 0) return [`  ${theme.badge("off")} none`];

  const commandWidth = Math.max("COMMAND".length, ...listeners.map((listener) => listener.command.length));
  const pidWidth = Math.max("PID".length, ...listeners.map((listener) => String(listener.pid).length));
  const rows = [
    `  ${padEndVisible(theme.label("COMMAND"), commandWidth)} ${padEndVisible(theme.label("PID"), pidWidth)} ${theme.label("ADDRESS")}`,
  ];

  for (const listener of listeners) {
    rows.push(
      `  ${padEndVisible(listener.command, commandWidth)} ${padEndVisible(listener.pid, pidWidth)} ${listener.address}`,
    );
  }

  return rows;
}

export function getTailscaleCommand(env = process.env) {
  return env.MACAWAKE_TAILSCALE ?? DEFAULT_TAILSCALE_PATH;
}

export async function tailscaleExists(path = DEFAULT_TAILSCALE_PATH) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readMacawakeState(fsApi, home) {
  const statePath = path.join(home, ".config", "macawake", "state.json");
  try {
    const raw = await fsApi.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      found: true,
      mode: typeof parsed.mode === "string" ? parsed.mode : "unknown",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch (error) {
    return {
      found: false,
      mode: "unknown",
      updatedAt: null,
    };
  }
}

function summarizeMacawakeState(state, keeperRunning) {
  const mode = SUPPORTED_MODES.includes(state.mode) ? state.mode : "unknown";
  const expectsKeeper = mode === "server" || mode === "aggressive";
  const expectsStopped = mode === "default" || mode === "light";

  if (mode === "unknown") {
    return {
      ...state,
      mode,
      keeperExpected: "unknown",
      keeperRunning,
      status: keeperRunning ? "warn" : "off",
      summary: keeperRunning ? "unknown (keeper running)" : "unknown (no saved mode)",
    };
  }

  if (expectsKeeper) {
    return {
      ...state,
      mode,
      keeperExpected: "running",
      keeperRunning,
      status: keeperRunning ? "ok" : "warn",
      summary: `${mode} (keeper ${keeperRunning ? "running" : "stopped; expected running"})`,
    };
  }

  if (expectsStopped) {
    return {
      ...state,
      mode,
      keeperExpected: "stopped",
      keeperRunning,
      status: keeperRunning ? "warn" : "ok",
      summary: `${mode} (keeper ${keeperRunning ? "running; expected stopped" : "stopped"})`,
    };
  }

  return {
    ...state,
    mode,
    keeperExpected: "unknown",
    keeperRunning,
    status: "warn",
    summary: `${mode} (unknown keeper expectation)`,
  };
}

function formatMacawakeSummary(macawake, theme) {
  if (macawake.status === "ok") return theme.success(macawake.summary);
  if (macawake.status === "warn") return theme.warning(macawake.summary);
  return macawake.summary;
}

async function safeRun(runner, command, args) {
  try {
    return await runner(command, args);
  } catch (error) {
    return { stdout: "", stderr: error.message, code: 1 };
  }
}
