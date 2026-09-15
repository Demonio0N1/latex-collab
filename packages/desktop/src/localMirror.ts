import { appDataDir, join, dirname } from "@tauri-apps/api/path";
import { mkdir, writeTextFile, writeFile, exists } from "@tauri-apps/plugin-fs";

/**
 * Every collaborator (host or remote guest) gets a real local copy of the
 * file they're editing, mirrored from the CRDT doc. External editors like
 * Texifier or TeXmaker need an actual file on disk to open/compile — they
 * can't read the in-memory Yjs document directly.
 */
export async function resolveLocalMirrorPath(
  projectId: string,
  projectName: string,
  relativeFilePath: string
): Promise<string> {
  const projectDir = await resolveProjectMirrorDir(projectId, projectName);
  const fullPath = await join(projectDir, relativeFilePath);
  await mkdir(await dirname(fullPath), { recursive: true });
  return fullPath;
}

/** The local folder all of a project's mirrored files live under. */
export async function resolveProjectMirrorDir(projectId: string, projectName: string): Promise<string> {
  const base = await appDataDir();
  const safeProjectName = projectName.replace(/[^a-zA-Z0-9-_]/g, "_");
  return join(base, "projects", `${safeProjectName}-${projectId}`);
}

export async function writeMirror(fullPath: string, content: string): Promise<void> {
  await writeTextFile(fullPath, content);
}

export async function writeMirrorBinary(fullPath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(await dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
}

export async function mirrorFileExists(fullPath: string): Promise<boolean> {
  try {
    return await exists(fullPath);
  } catch {
    return false;
  }
}
