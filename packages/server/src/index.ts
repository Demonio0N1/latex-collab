import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { PORT, HOST, TLS_CERT_PATH, TLS_KEY_PATH } from "./config.js";
import { router as projectsRouter } from "./projects.js";
import { openRouter } from "./openLanding.js";
import { getProject } from "./db.js";
import { resolveSafePath } from "./fileTree.js";
import { getOrCreateRoom } from "./docRoom.js";
import { verifyToken } from "./sessionTokens.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", projectsRouter);
app.use(openRouter);
app.get("/health", (_req, res) => res.json({ ok: true }));

// Serve HTTPS directly when a cert+key are configured (e.g. a VPS with a
// Let's Encrypt cert); otherwise plain HTTP (fine on loopback, or behind
// Tailscale Funnel / a reverse proxy that terminates TLS for us).
const tls = TLS_CERT_PATH && TLS_KEY_PATH;
const server = tls
  ? https.createServer(
      { cert: fs.readFileSync(TLS_CERT_PATH), key: fs.readFileSync(TLS_KEY_PATH) },
      app
    )
  : http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// WS URL shape: /ws/<projectId>/<urlencoded relative file path>
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "", "http://localhost");
  const match = url.pathname.match(/^\/ws\/([^/]+)\/(.+)$/);
  if (!match) {
    socket.destroy();
    return;
  }
  const [, projectId, encodedFilePath] = match;
  const project = getProject(projectId);
  if (!project) {
    socket.destroy();
    return;
  }

  if (!verifyToken(url.searchParams.get("token"), projectId)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  let absoluteFilePath: string;
  try {
    absoluteFilePath = resolveSafePath(project.root_path, decodeURIComponent(encodedFilePath));
  } catch {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    const roomId = `${projectId}::${encodedFilePath}`;
    const room = getOrCreateRoom(roomId, absoluteFilePath);
    room.addClient(ws);
  });
});

server.listen(PORT, HOST, () => {
  const scheme = tls ? "https" : "http";
  const shown = HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST;
  console.log(`latex-collab server listening on ${scheme}://${shown}:${PORT} (bind ${HOST})`);
});
