import { Command, type Child } from "@tauri-apps/plugin-shell";

export type LatexEngine = "pdflatex" | "xelatex" | "lualatex";

const ENGINE_KEY = "latex-collab:engine";

export function getEngine(): LatexEngine {
  return (localStorage.getItem(ENGINE_KEY) as LatexEngine | null) ?? "pdflatex";
}

export function setEngine(engine: LatexEngine): void {
  localStorage.setItem(ENGINE_KEY, engine);
}

function engineFlag(engine: LatexEngine): string {
  if (engine === "xelatex") return "-xelatex";
  if (engine === "lualatex") return "-lualatex";
  return "-pdf";
}

function splitDirAndFile(fullPath: string): { dir: string; file: string } {
  const separatorIndex = Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\"));
  return { dir: fullPath.slice(0, separatorIndex), file: fullPath.slice(separatorIndex + 1) };
}

export function pdfPathFor(texFilePath: string): string {
  return texFilePath.replace(/\.tex$/i, ".pdf");
}

export interface Watcher {
  stop: () => Promise<void>;
}

/**
 * Keyed by absolute .tex path, independent of React's render/effect
 * lifecycle. A component unmount's cleanup calling `stop()` is not
 * guaranteed to be awaited before the next mount's `startWatcher()` runs
 * (React cleanup functions are fire-and-forget), so relying on effect
 * timing alone let two `latexmk -pvc` processes end up watching the same
 * file at once — they'd race writing the same .pdf/.aux/.log, and changes
 * could stop reflecting in the preview. This registry makes "at most one
 * watcher per file" a hard invariant instead of a timing accident.
 */
const activeWatchers = new Map<string, Watcher>();

/**
 * Only "latexmk" is allowlisted in the Tauri shell scope (see
 * src-tauri/capabilities/default.json) — Tauri v2 requires every runnable
 * program to be declared ahead of time, arbitrary user-typed commands
 * aren't possible here. Picking an engine (pdflatex/xelatex/lualatex)
 * covers essentially every real LaTeX project without needing that.
 *
 * `-pvc` starts latexmk in continuous-preview mode: it watches the .tex
 * file and everything it \input/\include's, and recompiles incrementally
 * whenever something changes — reusing loaded format files between runs
 * instead of paying LaTeX's full startup cost on every keystroke, the way
 * a naive "recompile from scratch each time" approach would.
 */
export async function startWatcher(texFilePath: string, onLog: (chunk: string) => void): Promise<Watcher> {
  const existing = activeWatchers.get(texFilePath);
  if (existing) {
    await existing.stop();
  }

  const { dir, file } = splitDirAndFile(texFilePath);
  const engine = getEngine();
  const args = ["-pvc", "-view=none", engineFlag(engine), "-interaction=nonstopmode", "-f", file];

  const command = Command.create("latexmk", args, { cwd: dir });
  command.stdout.on("data", onLog);
  command.stderr.on("data", onLog);

  let child: Child | null = null;
  try {
    child = await command.spawn();
  } catch (err) {
    onLog(`No se pudo iniciar latexmk: ${String(err instanceof Error ? err.message : err)}`);
  }

  const watcher: Watcher = {
    stop: async () => {
      try {
        await child?.kill();
      } catch {
        // already exited
      }
      if (activeWatchers.get(texFilePath) === watcher) {
        activeWatchers.delete(texFilePath);
      }
    },
  };
  activeWatchers.set(texFilePath, watcher);
  return watcher;
}
