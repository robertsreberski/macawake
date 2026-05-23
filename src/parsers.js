export function parsePmsetCustom(output) {
  const sections = {};
  let current = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const sectionMatch = line.match(/^(Battery Power|AC Power):$/);
    if (sectionMatch) {
      current = sectionMatch[1];
      sections[current] = {};
      continue;
    }

    if (!current) continue;
    const settingMatch = line.trim().match(/^([A-Za-z0-9_]+)\s+(.+)$/);
    if (settingMatch) {
      sections[current][settingMatch[1]] = settingMatch[2].trim();
    }
  }

  return sections;
}

export function parsePmsetBattSource(output) {
  const match = output.match(/Now drawing from '([^']+)'/);
  return match?.[1] ?? "Unknown";
}

export function parseTailscaleStatus(output) {
  try {
    const parsed = JSON.parse(output);
    const self = parsed.Self ?? {};
    return {
      backendState: parsed.BackendState ?? "Unknown",
      dnsName: stripTrailingDot(self.DNSName ?? null),
      ips: self.TailscaleIPs ?? parsed.TailscaleIPs ?? [],
      online: Boolean(self.Online),
      health: parsed.Health ?? [],
    };
  } catch {
    const trimmed = output.trim();
    return {
      backendState: "Unknown",
      dnsName: null,
      ips: [],
      online: false,
      health: trimmed ? [trimmed] : [],
    };
  }
}

export function parseLsofListeners(output) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  const dataLines = lines[0]?.startsWith("COMMAND") ? lines.slice(1) : lines;

  return dataLines.flatMap((line) => {
    const parts = line.trim().split(/\s+/);
    const tcpIndex = parts.indexOf("TCP");
    if (parts.length < 2 || tcpIndex === -1 || !parts.includes("(LISTEN)")) {
      return [];
    }

    const pid = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(pid)) return [];

    return [
      {
        command: parts[0],
        pid,
        address: parts[tcpIndex + 1],
      },
    ];
  });
}

function stripTrailingDot(value) {
  return typeof value === "string" ? value.replace(/\.$/, "") : value;
}
