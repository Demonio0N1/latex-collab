import { Router } from "express";
import { APP_DOWNLOAD_URL } from "./config.js";

export const openRouter = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Plain http(s) landing page, served by this same collaboration server, so
 * a share link is a normal clickable URL (works in any chat app/email)
 * instead of a raw custom-scheme link most apps refuse to render as a link.
 * It hands off to the desktop app's registered `latexcollab://` scheme, and
 * falls back to a download link if that doesn't take (app not installed).
 */
openRouter.get("/open", (req, res) => {
  const host = typeof req.query.host === "string" ? req.query.host : "";
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const key = typeof req.query.key === "string" ? req.query.key : "";

  if (!host || !id || !key) {
    res.status(400).send("Link inválido: faltan datos del proyecto.");
    return;
  }

  const deepLink = `latexcollab://${host}/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`;
  const safeDeepLinkAttr = escapeHtml(deepLink);
  const safeHost = escapeHtml(host);
  const safeDownloadUrl = escapeHtml(APP_DOWNLOAD_URL);
  // Editor web servido por este mismo servidor: entrar a editar sin instalar nada.
  const webEditUrl = `/app?id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
  const safeWebEditUrl = escapeHtml(webEditUrl);

  res.type("html").send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Abrir LaTeX Collab</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0c0d10; color:#ececed; font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif; }
  .card { max-width:420px; padding:32px; text-align:center; }
  h1 { font-size:18px; margin-bottom:8px; }
  p { color:#9a9ba3; font-size:13px; line-height:1.6; }
  a.button { display:inline-block; margin-top:16px; padding:10px 20px; border-radius:8px;
             background:#5b8cff; color:white; text-decoration:none; font-weight:600; font-size:13px; }
  a.secondary { display:block; margin-top:22px; color:#6c6d75; font-size:12px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Te invitaron a un proyecto de LaTeX</h1>
    <p>Proyecto alojado en <strong>${safeHost}</strong>. Elige cómo entrar:</p>
    <a class="button" href="${safeWebEditUrl}">📝 Editar en el navegador (sin instalar nada)</a>
    <p style="margin-top:18px">¿Prefieres la app de escritorio?</p>
    <a class="button" style="background:#2a2c33" href="${safeDeepLinkAttr}">Abrir en la app LaTeX Collab</a>
    <a class="secondary" href="${safeDownloadUrl}/releases/latest" target="_blank" rel="noopener">Descargar la app (Mac/Windows/Linux/Android) →</a>
  </div>
</body>
</html>`);
});
