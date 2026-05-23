const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

const CODES = {
  bold: ["\x1b[1m", "\x1b[22m"],
  dim: ["\x1b[2m", "\x1b[22m"],
  cyan: ["\x1b[36m", "\x1b[39m"],
  green: ["\x1b[32m", "\x1b[39m"],
  yellow: ["\x1b[33m", "\x1b[39m"],
  red: ["\x1b[31m", "\x1b[39m"],
  magenta: ["\x1b[35m", "\x1b[39m"],
};

export function createTheme({ color = false } = {}) {
  const apply = (style, value) => {
    const text = String(value);
    if (!color || text.length === 0) return text;
    const [open, close] = CODES[style];
    return `${open}${text}${close}`;
  };

  return {
    color,
    title: (value) => apply("bold", apply("cyan", value)),
    section: (value) => apply("bold", value),
    label: (value) => apply("dim", value),
    command: (value) => apply("dim", value),
    value: (value) => apply("cyan", value),
    success: (value) => apply("green", value),
    warning: (value) => apply("yellow", value),
    error: (value) => apply("red", value),
    badge: (kind) => badge(kind, apply),
  };
}

export function shouldUseColor({ flags = new Set(), env = process.env, stdout = process.stdout } = {}) {
  if (flags.has("--no-color")) return false;
  if (flags.has("--color")) return true;
  if (Object.hasOwn(env, "NO_COLOR")) return false;
  if (env.TERM === "dumb") return false;
  return stdout?.isTTY === true;
}

export function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "");
}

export function padEndVisible(value, width) {
  const text = String(value);
  const visibleLength = stripAnsi(text).length;
  return `${text}${" ".repeat(Math.max(0, width - visibleLength))}`;
}

function badge(kind, apply) {
  switch (kind) {
    case "ok":
      return apply("green", "[ok]");
    case "warn":
      return apply("yellow", "[warn]");
    case "off":
      return apply("dim", "[off]");
    case "run":
      return apply("cyan", "[run]");
    case "write":
      return apply("magenta", "[write]");
    default:
      return `[${kind}]`;
  }
}
