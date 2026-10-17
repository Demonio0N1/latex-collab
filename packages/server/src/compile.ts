import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Compilación de LaTeX EN EL SERVIDOR (modo navegador, estilo Overleaf):
 * los colaboradores editan desde el browser y el Pi corre latexmk por ellos.
 *
 * Seguridad/estabilidad:
 *  - `-no-shell-escape`: el .tex no puede ejecutar comandos del sistema.
 *  - timeout duro (default 90 s) por compilación.
 *  - un solo latexmk a la vez POR PROYECTO (cola en serie) para no tumbar el Pi.
 */

const COMPILE_TIMEOUT_MS = Number(process.env.LATEX_COLLAB_COMPILE_TIMEOUT_MS ?? 90_000);
const LOG_TAIL_CHARS = 20_000;

export type ServerEngine = "pdflatex" | "xelatex" | "lualatex";
const ENGINE_FLAG: Record<ServerEngine, string> = {
  pdflatex: "-pdf",
  xelatex: "-xelatex",
  lualatex: "-lualatex",
};

export function isServerEngine(value: unknown): value is ServerEngine {
  return value === "pdflatex" || value === "xelatex" || value === "lualatex";
}

export interface CompileResult {
  ok: boolean;
  log: string;
  pdfPath: string | null;
}

// Cola por proyecto: el siguiente compile espera a que termine el anterior.
const queues = new Map<string, Promise<unknown>>();

export function compileProject(
  projectId: string,
  absoluteTexPath: string,
  engine: ServerEngine
): Promise<CompileResult> {
  const prev = queues.get(projectId) ?? Promise.resolve();
  const run = prev.then(() => runLatexmk(absoluteTexPath, engine));
  queues.set(
    projectId,
    run.catch(() => undefined)
  );
  return run;
}

function runLatexmk(absoluteTexPath: string, engine: ServerEngine): Promise<CompileResult> {
  return new Promise((resolve) => {
    const dir = path.dirname(absoluteTexPath);
    const file = path.basename(absoluteTexPath);
    const args = [ENGINE_FLAG[engine], "-interaction=nonstopmode", "-no-shell-escape", "-f", file];

    let log = "";
    const append = (chunk: Buffer) => {
      log = (log + chunk.toString("utf8")).slice(-LOG_TAIL_CHARS);
    };

    const child = spawn("latexmk", args, { cwd: dir });
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      log += "\n\n[servidor] Compilación cancelada: superó el tiempo máximo.";
      child.kill("SIGKILL");
    }, COMPILE_TIMEOUT_MS);

    const finish = (code: number | null) => {
      clearTimeout(timer);
      const pdfPath = absoluteTexPath.replace(/\.tex$/i, ".pdf");
      const ok = code === 0 && fs.existsSync(pdfPath);
      resolve({ ok, log, pdfPath: fs.existsSync(pdfPath) ? pdfPath : null });
    };

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        log: `[servidor] No se pudo iniciar latexmk: ${err.message}.\n¿Está LaTeX instalado en el servidor? (sudo apt install texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-lang-spanish latexmk)`,
        pdfPath: null,
      });
    });
    child.on("close", finish);
  });
}
