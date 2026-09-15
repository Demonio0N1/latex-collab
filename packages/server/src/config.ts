import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.LATEX_COLLAB_PORT ?? 5959);

// Where all project folders + the sqlite metadata db live.
export const DATA_DIR =
  process.env.LATEX_COLLAB_DATA_DIR ?? path.join(os.homedir(), ".latex-collab", "projects");

export const TEMPLATES_DIR =
  process.env.LATEX_COLLAB_TEMPLATES_DIR ?? path.join(process.cwd(), "..", "..", "templates");

// Where the "Abrir con la app" landing page (see routes/open.ts) sends
// someone who clicked a share link but doesn't have the desktop app
// installed yet. UPDATE THIS before sharing links outside your own machine.
export const APP_DOWNLOAD_URL =
  process.env.LATEX_COLLAB_DOWNLOAD_URL ?? "https://github.com/Demonio0N1/latex-collab";
