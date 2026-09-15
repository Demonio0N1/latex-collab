import { documentDir, desktopDir, join } from "@tauri-apps/api/path";

export type DefaultLocation = "documents" | "desktop";

const LOCATION_KEY = "latex-collab:defaultLocation";
const FOLDER_NAME = "LaTeX Projects";

export function getDefaultLocationPref(): DefaultLocation {
  return (localStorage.getItem(LOCATION_KEY) as DefaultLocation | null) ?? "documents";
}

export function setDefaultLocationPref(location: DefaultLocation): void {
  localStorage.setItem(LOCATION_KEY, location);
}

/** ~/Documents/LaTeX Projects/<nombre> or ~/Desktop/LaTeX Projects/<nombre>, per user preference. */
export async function suggestProjectPath(projectName: string): Promise<string> {
  const base = getDefaultLocationPref() === "desktop" ? await desktopDir() : await documentDir();
  const safeName = projectName.trim().replace(/[\\/:*?"<>|]/g, "_") || "proyecto";
  return join(base, FOLDER_NAME, safeName);
}
