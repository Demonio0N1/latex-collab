import type {
  CreateProjectRequest,
  CreateProjectResponse,
  JoinProjectRequest,
  JoinProjectResponse,
  ProjectFile,
  ProjectSummary,
} from "@latex-collab/shared";

export class ApiError extends Error {}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function listTemplates(baseUrl: string): Promise<{ templates: string[] }> {
  return request(baseUrl, "/api/templates");
}

export interface NetworkInfo {
  addresses: string[];
  port: number;
  /** Tailscale Funnel public URL (e.g. https://my-mac.tailnet.ts.net), if active. Reachable by anyone, no Tailscale required on their end. */
  funnelUrl: string | null;
}

export function getNetworkInfo(baseUrl: string): Promise<NetworkInfo> {
  return request(baseUrl, "/api/network-info");
}

export function listProjects(baseUrl: string): Promise<{ projects: ProjectSummary[] }> {
  return request(baseUrl, "/api/projects");
}

export function createProject(
  baseUrl: string,
  body: CreateProjectRequest
): Promise<CreateProjectResponse> {
  return request(baseUrl, "/api/projects", { method: "POST", body: JSON.stringify(body) });
}

export function joinProject(
  baseUrl: string,
  projectId: string,
  body: JoinProjectRequest
): Promise<JoinProjectResponse> {
  return request(baseUrl, `/api/projects/${projectId}/join`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function importArchive(baseUrl: string, projectId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("archive", file);
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/import`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new ApiError(`Import failed (${res.status})`);
}

export function listProjectFiles(baseUrl: string, projectId: string): Promise<{ files: ProjectFile[] }> {
  return request(baseUrl, `/api/projects/${projectId}/files`);
}

/** Uploads a binary file (e.g. an image inserted from the toolbar) into the project at `relativePath`. */
export async function uploadProjectFile(
  baseUrl: string,
  projectId: string,
  relativePath: string,
  bytes: Uint8Array
): Promise<{ files: ProjectFile[] }> {
  const form = new FormData();
  form.append("path", relativePath);
  form.append("file", new Blob([new Uint8Array(bytes)]), relativePath.split("/").pop());
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/files/upload`, { method: "POST", body: form });
  if (!res.ok) throw new ApiError(`Upload failed (${res.status})`);
  return res.json();
}

export async function downloadProjectFile(baseUrl: string, projectId: string, relativePath: string): Promise<Uint8Array> {
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/files/download?path=${encodeURIComponent(relativePath)}`);
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * A bare host string never carries its own scheme. Our LAN/Tailscale-IP
 * links always include our server's explicit port (":5959"); a Tailscale
 * Funnel host never does (Funnel is always HTTPS on the implicit 443) — so
 * "has an explicit port" reliably tells http (LAN) from https (Funnel).
 */
function inferBaseUrl(host: string): string {
  return /:\d+$/.test(host) ? `http://${host}` : `https://${host}`;
}

/**
 * Parses a share link into its host/projectId/password parts, so the join
 * dialog can autofill. Accepts both:
 *  - the clickable http(s) landing link: http://host:port/open?host=...&id=...&key=...
 *  - the raw custom-scheme link the desktop app registers with the OS:
 *    latexcollab://host:port/projectId?key=secret
 */
export function parseShareLink(link: string): { baseUrl: string; projectId: string; password: string } | null {
  try {
    if (link.startsWith("latexcollab://")) {
      const url = new URL(link.replace(/^latexcollab:\/\//, "http://"));
      const projectId = url.pathname.replace(/^\//, "");
      const password = url.searchParams.get("key") ?? "";
      if (!projectId || !password) return null;
      return { baseUrl: inferBaseUrl(url.host), projectId, password };
    }

    const url = new URL(link);
    const host = url.searchParams.get("host");
    const projectId = url.searchParams.get("id");
    const password = url.searchParams.get("key");
    if (!host || !projectId || !password) return null;
    return { baseUrl: inferBaseUrl(host), projectId, password };
  } catch {
    return null;
  }
}

/** The clickable link to hand out (a normal http(s) URL any chat app will render as a link). */
export function buildShareLink(baseUrl: string, projectId: string, password: string): string {
  const host = baseUrl.replace(/^https?:\/\//, "");
  const httpBase = baseUrl.startsWith("https://") ? baseUrl : `http://${host}`;
  const params = new URLSearchParams({ host, id: projectId, key: password });
  return `${httpBase}/open?${params.toString()}`;
}

/** The raw OS-level deep link the desktop app registers itself to handle. */
export function buildDeepLink(host: string, projectId: string, password: string): string {
  return `latexcollab://${host}/${projectId}?key=${encodeURIComponent(password)}`;
}
