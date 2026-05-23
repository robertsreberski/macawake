import { spawn } from "node:child_process";

export function runCommand(command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ stdout, stderr: error.message, code: 127 });
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

export function formatCommand(command, args = []) {
  return [command, ...args].map(quoteShellArg).join(" ");
}

function quoteShellArg(value) {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_./:=@%+~-]+$/.test(stringValue)) return stringValue;
  return `'${stringValue.replaceAll("'", "'\\''")}'`;
}
