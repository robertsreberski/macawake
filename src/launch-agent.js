import path from "node:path";

import { KEEPER_LABEL } from "./modes.js";

export function getLaunchAgentPath(home) {
  return path.join(home, "Library", "LaunchAgents", `${KEEPER_LABEL}.plist`);
}

export function buildLaunchAgentPlist(caffeinateArgs) {
  const args = ["/usr/bin/caffeinate", ...caffeinateArgs]
    .map((arg) => `    <string>${escapeXml(arg)}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${KEEPER_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/${KEEPER_LABEL}.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/${KEEPER_LABEL}.err.log</string>
</dict>
</plist>
`;
}

export function getLaunchctlTarget(uid = process.getuid?.()) {
  if (typeof uid !== "number") {
    throw new Error("Unable to determine current uid for launchctl target.");
  }
  return `gui/${uid}/${KEEPER_LABEL}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
