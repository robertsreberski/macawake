export const KEEPER_LABEL = "dev.macawake.keeper";

export const AGGRESSIVE_WARNING =
  "Aggressive mode is intended for a plugged-in, ventilated Mac on a desk. Do not use it in a bag or sleeve.";

const DEFAULT_BATTERY = {
  hibernatemode: 3,
  sleep: 10,
  displaysleep: 5,
  standby: 1,
  powernap: 1,
  tcpkeepalive: 1,
  ttyskeepawake: 1,
  womp: 0,
  lessbright: 1,
  disksleep: 10,
};

const DEFAULT_AC = {
  hibernatemode: 3,
  sleep: 30,
  displaysleep: 10,
  standby: 1,
  powernap: 1,
  tcpkeepalive: 1,
  ttyskeepawake: 1,
  womp: 1,
  disksleep: 10,
};

const LIGHT_BATTERY = {
  hibernatemode: 25,
  sleep: 1,
  displaysleep: 2,
  standby: 1,
  powernap: 0,
  tcpkeepalive: 0,
  ttyskeepawake: 1,
  womp: 0,
  lessbright: 1,
  disksleep: 10,
};

const SERVER_ALL = {
  sleep: 0,
  hibernatemode: 3,
  powernap: 1,
  tcpkeepalive: 1,
  ttyskeepawake: 1,
  womp: 1,
  disksleep: 10,
};

export const SUPPORTED_MODES = ["default", "light", "server", "aggressive"];

export function getProfileCommands(mode) {
  switch (mode) {
    case "default":
      return [
        pmset("-b", DEFAULT_BATTERY),
        pmset("-c", DEFAULT_AC),
        pmset("-a", { disablesleep: 0 }),
      ];
    case "light":
      return [
        pmset("-b", LIGHT_BATTERY),
        pmset("-c", DEFAULT_AC),
        pmset("-a", { disablesleep: 0 }),
      ];
    case "server":
      return [pmset("-a", SERVER_ALL), pmset("-a", { disablesleep: 0 })];
    case "aggressive":
      return [pmset("-a", SERVER_ALL), pmset("-a", { disablesleep: 1 })];
    default:
      throw new Error(`Unsupported mode: ${mode}`);
  }
}

export function buildModePlan(mode, options = {}) {
  if (!SUPPORTED_MODES.includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  if (mode === "aggressive" && options.powerSource === "Battery Power" && !options.forceBattery) {
    throw new Error("Aggressive mode requires AC power. Re-run with --force-battery to override.");
  }

  const plan = {
    mode,
    profileCommands: getProfileCommands(mode),
    warning: null,
    keeperAction: "none",
    keeper: null,
  };

  if (mode === "default" || mode === "light") {
    plan.keeperAction = "stop";
    return plan;
  }

  plan.keeperAction = "start";
  plan.keeper = {
    label: KEEPER_LABEL,
    caffeinateArgs: mode === "aggressive" ? ["-i", "-m", "-s"] : ["-i", "-m"],
  };
  plan.warning = mode === "aggressive" ? AGGRESSIVE_WARNING : null;
  return plan;
}

function pmset(scope, values) {
  return {
    command: "sudo",
    args: ["pmset", scope, ...Object.entries(values).flatMap(([key, value]) => [key, String(value)])],
  };
}
