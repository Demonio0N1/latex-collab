import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.LATEX_COLLAB_PORT ?? 5959);

// Bind address. Default to loopback: the server is reachable from this
// machine and from Tailscale Funnel (which proxies to 127.0.0.1), but NOT
// from the LAN or a direct Tailscale IP unless you opt in by setting
// LATEX_COLLAB_HOST=0.0.0.0 (LAN/Tailscale) or a specific interface IP.
export const HOST = process.env.LATEX_COLLAB_HOST ?? "127.0.0.1";

// Optional gate on creating projects. When set, POST /projects requires the
// x-create-password header to match — so an exposed server can't be used by
// strangers to create projects (and fill your disk). Unset = open (default,
// convenient for a private self-host).
export const CREATE_PASSWORD = process.env.LATEX_COLLAB_CREATE_PASSWORD ?? "";

// Optional TLS: set both to serve https/wss directly (e.g. a VPS with a
// Let's Encrypt cert), instead of relying on Tailscale Funnel for HTTPS.
export const TLS_CERT_PATH = process.env.LATEX_COLLAB_TLS_CERT ?? "";
export const TLS_KEY_PATH = process.env.LATEX_COLLAB_TLS_KEY ?? "";

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
