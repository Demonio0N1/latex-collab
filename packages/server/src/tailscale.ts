import { execFile } from "node:child_process";
import fs from "node:fs";

// Plain "tailscale" works when the CLI is on PATH (typical on Linux and
// Homebrew installs). The macOS GUI app (App Store / .pkg) ships its CLI
// inside the app bundle instead, and only symlinks it onto PATH if the
// user explicitly runs "Install Tailscale CLI" from its menu — so we also
// try that known location directly.
const CANDIDATE_BINARIES = [
  "tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/usr/bin/tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
];

function runTailscale(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const tryCandidate = (index: number) => {
      if (index >= CANDIDATE_BINARIES.length) {
        resolve(null);
        return;
      }
      const bin = CANDIDATE_BINARIES[index];
      if (bin.startsWith("/") && !fs.existsSync(bin)) {
        tryCandidate(index + 1);
        return;
      }
      execFile(bin, args, { timeout: 3000 }, (err, stdout) => {
        if (err) tryCandidate(index + 1);
        else resolve(stdout);
      });
    };
    tryCandidate(0);
  });
}

/**
 * Best-effort detection of an active Tailscale Funnel exposing this
 * server — Funnel gives out a real public HTTPS URL (https://x.ts.net)
 * that anyone can reach, with no Tailscale install on their end. This is
 * purely optional: if tailscale isn't installed, isn't logged in, or
 * Funnel isn't running, this resolves to null and the Share dialog just
 * falls back to LAN/Tailscale-IP addresses. Never throws.
 */
export async function detectTailscaleFunnelUrl(): Promise<string | null> {
  const stdout = await runTailscale(["funnel", "status"]);
  if (!stdout) return null;
  const match = stdout.match(/^(https:\/\/\S+)\s+\(Funnel on\)/m);
  return match ? match[1] : null;
}
