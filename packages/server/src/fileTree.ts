import fs from "node:fs";
import path from "node:path";
import { kindForPath, type ProjectFile } from "@latex-collab/shared";

const IGNORED_DIRS = new Set([".git", "node_modules", ".latex-collab-meta"]);

export function scanProjectFiles(rootPath: string): ProjectFile[] {
  const results: ProjectFile[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(rootPath, fullPath);
        results.push({
          path: relativePath,
          kind: kindForPath(relativePath),
          sizeBytes: fs.statSync(fullPath).size,
        });
      }
    }
  }

  if (fs.existsSync(rootPath)) walk(rootPath);
  return results;
}

/** Guards against a client asking for a path that escapes the project folder. */
export function resolveSafePath(rootPath: string, relativePath: string): string {
  const resolved = path.resolve(rootPath, relativePath);
  if (!resolved.startsWith(path.resolve(rootPath) + path.sep) && resolved !== path.resolve(rootPath)) {
    throw new Error("Path escapes project root");
  }
  return resolved;
}
