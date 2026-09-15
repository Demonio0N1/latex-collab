import { randomBytes } from "node:crypto";

interface TokenEntry {
  projectId: string;
  expiresAt: number;
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const tokens = new Map<string, TokenEntry>();

export function issueToken(projectId: string): string {
  const token = randomBytes(24).toString("hex");
  tokens.set(token, { projectId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/** Returns true if the token is valid for this project (and still fresh). */
export function verifyToken(token: string | null, projectId: string): boolean {
  if (!token) return false;
  const entry = tokens.get(token);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    tokens.delete(token);
    return false;
  }
  return entry.projectId === projectId;
}
