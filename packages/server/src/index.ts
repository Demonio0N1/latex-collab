import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { PORT } from "./config.js";
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

const server = http.createServer(app);
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

server.listen(PORT, () => {
  console.log(`latex-collab server listening on http://localhost:${PORT}`);
});
