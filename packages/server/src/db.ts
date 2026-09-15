import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "./config.js";

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "latex-collab.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    root_path TEXT NOT NULL
  );
`);

export interface ProjectRow {
  id: string;
  name: string;
  password_hash: string;
  created_at: number;
  root_path: string;
}

export function insertProject(row: ProjectRow): void {
  db.prepare(
    `INSERT INTO projects (id, name, password_hash, created_at, root_path)
     VALUES (?, ?, ?, ?, ?)`
  ).run(row.id, row.name, row.password_hash, row.created_at, row.root_path);
}

export function getProject(id: string): ProjectRow | undefined {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as unknown as ProjectRow | undefined;
}

export function listProjects(): ProjectRow[] {
  return db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as unknown as ProjectRow[];
}
