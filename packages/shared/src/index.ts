export type FileKind = "tex" | "bib" | "cls" | "sty" | "bst" | "image" | "other";

export interface ProjectFile {
  path: string; // relative to project root, e.g. "chapters/intro.tex"
  kind: FileKind;
  sizeBytes: number;
}

export interface ProjectSummary {
  id: string; // e.g. "swift-falcon-482"
  name: string;
  createdAt: number;
}

export interface CreateProjectRequest {
  name: string;
  password: string;
  template?: string; // template id from templates/ , omitted = blank project
  rootPath?: string; // absolute path chosen by the user; omitted = server picks its default data dir
}

export interface CreateProjectResponse {
  project: ProjectSummary;
}

export interface JoinProjectRequest {
  password: string;
}

export interface JoinProjectResponse {
  project: ProjectSummary;
  files: ProjectFile[];
  wsUrl: string; // e.g. ws://host:5959
  token: string; // short-lived session token, required on the WS connection
}

export interface PresenceState {
  name: string;
  color: string;
  filePath: string | null;
}

export function kindForPath(path: string): FileKind {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tex") return "tex";
  if (ext === "bib") return "bib";
  if (ext === "cls") return "cls";
  if (ext === "sty") return "sty";
  if (ext === "bst") return "bst";
  if (["png", "jpg", "jpeg", "pdf", "eps", "svg"].includes(ext)) return "image";
  return "other";
}

export function randomColor(seed: string): string {
  // deterministic pastel color per user, no deps
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 55%)`;
}
