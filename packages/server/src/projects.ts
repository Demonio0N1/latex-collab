import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { Router } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";
import type { CreateProjectRequest, JoinProjectRequest } from "@latex-collab/shared";
import { DATA_DIR, TEMPLATES_DIR, PORT, CREATE_PASSWORD } from "./config.js";
import { rateLimit, clientIp, isTrulyLocal } from "./rateLimit.js";
import { insertProject, getProject } from "./db.js";
import { scanProjectFiles, resolveSafePath } from "./fileTree.js";
import { issueToken, verifyToken } from "./sessionTokens.js";
import { detectTailscaleFunnelUrl } from "./tailscale.js";

/** Bearer token (from /join) via Authorization header or ?token= query. */
function tokenFromReq(req: import("express").Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return typeof req.query.token === "string" ? req.query.token : null;
}

/** Rejects the request unless it carries a valid session token for the project. */
function requireProjectAuth(req: import("express").Request, res: import("express").Response, projectId: string): boolean {
  if (verifyToken(tokenFromReq(req), projectId)) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);
const upload = multer({ dest: path.join(DATA_DIR, "_uploads") });

// Throttle password guessing on join (per IP + project) and project-creation
// spam (per IP).
const joinLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 12,
  key: (req) => `${clientIp(req)}:${req.params.id}`,
  message: "Demasiados intentos de contraseña. Espera unos minutos.",
});
const createLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  key: (req) => clientIp(req),
  message: "Demasiados proyectos creados. Espera un momento.",
});
const fileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const router = Router();

// Note: there is deliberately no unauthenticated "list all projects"
// endpoint — it would leak every project's id/name to anyone who can reach
// the server. Clients open a known project via /join (which checks the
// password) and remember their own projects locally.

router.post("/projects", createLimiter, async (req, res) => {
  // Optional server-wide gate so an exposed server can't be used by
  // strangers to create projects. Off by default (private self-host). The
  // local operator (same machine as the server) is always allowed, so setting
  // it doesn't lock you out of your own desktop app; only remote callers must
  // send the matching x-create-password header.
  if (CREATE_PASSWORD && !isTrulyLocal(req) && req.headers["x-create-password"] !== CREATE_PASSWORD) {
    return res.status(401).json({ error: "server requires a create password" });
  }
  const body = req.body as CreateProjectRequest;
  if (!body.name || !body.password) {
    return res.status(400).json({ error: "name and password are required" });
  }

  // The client (desktop app, same machine as this server in the normal
  // self-hosted setup) may pick exactly where the project folder lives —
  // e.g. via a native "choose folder" dialog defaulting to ~/Documents or
  // ~/Desktop. Falls back to the server's own data directory otherwise.
  if (body.rootPath !== undefined && !path.isAbsolute(body.rootPath)) {
    return res.status(400).json({ error: "rootPath must be an absolute path" });
  }

  const id = nanoid();
  const rootPath = body.rootPath ?? path.join(DATA_DIR, id);
  fs.mkdirSync(rootPath, { recursive: true });

  if (body.template) {
    const templatePath = path.join(TEMPLATES_DIR, body.template);
    if (fs.existsSync(templatePath)) {
      fs.cpSync(templatePath, rootPath, { recursive: true });
    }
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const createdAt = Date.now();
  insertProject({ id, name: body.name, password_hash: passwordHash, created_at: createdAt, root_path: rootPath });

  res.json({ project: { id, name: body.name, createdAt } });
});

router.post("/projects/:id/join", joinLimiter, async (req, res) => {
  const { id } = req.params;
  const body = req.body as JoinProjectRequest;
  const project = getProject(id);
  if (!project) return res.status(404).json({ error: "project not found" });

  const valid = await bcrypt.compare(body.password ?? "", project.password_hash);
  if (!valid) return res.status(401).json({ error: "invalid password" });

  const files = scanProjectFiles(project.root_path);
  const token = issueToken(project.id);
  // Advisory only — clients derive the ws origin from their own baseUrl. Still,
  // report the right scheme: https via direct TLS (req.secure) or a
  // TLS-terminating proxy/Funnel that sets X-Forwarded-Proto.
  const xfProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(xfProto) ? xfProto[0] : xfProto)?.split(",")[0].trim();
  const secure = proto === "https" || req.secure;
  res.json({
    project: { id: project.id, name: project.name, createdAt: project.created_at },
    files,
    wsUrl: `${secure ? "wss" : "ws"}://${req.hostname}:${PORT}`,
    token,
  });
});

router.post("/projects/:id/import", upload.single("archive"), async (req, res) => {
  const { id } = req.params;
  if (!requireProjectAuth(req, res, id)) return;
  const project = getProject(id);
  if (!project) return res.status(404).json({ error: "project not found" });
  if (!req.file) return res.status(400).json({ error: "archive file is required" });

  const zip = new AdmZip(req.file.path);
  zip.extractAllTo(project.root_path, true);
  fs.unlinkSync(req.file.path);

  res.json({ files: scanProjectFiles(project.root_path) });
});

router.get("/projects/:id/files", (req, res) => {
  if (!requireProjectAuth(req, res, req.params.id)) return;
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "project not found" });
  res.json({ files: scanProjectFiles(project.root_path) });
});

/**
 * Uploads a single binary file (typically an image inserted from the
 * editor's toolbar) into the project folder at the given relative path,
 * so every collaborator's `\includegraphics{...}` resolves the same file.
 */
router.post("/projects/:id/files/upload", fileUpload.single("file"), (req, res) => {
  if (!requireProjectAuth(req, res, req.params.id)) return;
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "project not found" });
  if (!req.file) return res.status(400).json({ error: "file is required" });

  const relativePath = typeof req.body.path === "string" && req.body.path ? req.body.path : req.file.originalname;
  let targetPath: string;
  try {
    targetPath = resolveSafePath(project.root_path, relativePath);
  } catch {
    return res.status(400).json({ error: "invalid path" });
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, req.file.buffer);
  res.json({ files: scanProjectFiles(project.root_path) });
});

/** Downloads a single project file's raw bytes (used to fetch images other collaborators added). */
router.get("/projects/:id/files/download", (req, res) => {
  if (!requireProjectAuth(req, res, req.params.id)) return;
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "project not found" });

  const relativePath = typeof req.query.path === "string" ? req.query.path : "";
  let targetPath: string;
  try {
    targetPath = resolveSafePath(project.root_path, relativePath);
  } catch {
    return res.status(400).json({ error: "invalid path" });
  }
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    return res.status(404).json({ error: "file not found" });
  }
  res.sendFile(targetPath);
});

/**
 * Candidate addresses another machine could use to reach this server —
 * "localhost" only works from the same machine, so the Share dialog needs
 * a real LAN (or VPN) address to build a usable link/host.
 */
router.get("/network-info", async (req, res) => {
  // Only the host itself needs this (the Share dialog runs on the same
  // machine as the server); a remote client shouldn't learn our LAN IPs.
  if (!isTrulyLocal(req)) return res.status(403).json({ error: "forbidden" });
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      // Skip loopback/internal and link-local (169.254.x.x) addresses —
      // link-local is auto-assigned when there's no real network reachable
      // and never works for anyone but this exact machine's segment.
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        addresses.push(entry.address);
      }
    }
  }
  const funnelUrl = await detectTailscaleFunnelUrl();
  res.json({ addresses, port: PORT, funnelUrl });
});

router.get("/templates", (_req, res) => {
  if (!fs.existsSync(TEMPLATES_DIR)) return res.json({ templates: [] });
  const templates = fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  res.json({ templates });
});
