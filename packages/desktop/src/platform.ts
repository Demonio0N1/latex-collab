import { platform } from "@tauri-apps/plugin-os";

/** True cuando corremos dentro de Tauri (app instalada); false en un navegador normal. */
export const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** True en el editor web servido por el servidor (modo navegador, estilo Overleaf). */
export const IS_WEB = !IS_TAURI;

let cachedPlatform: string | null = null;

function currentPlatform(): string {
  if (cachedPlatform === null) {
    if (!IS_TAURI) {
      cachedPlatform = "web";
    } else {
      try {
        cachedPlatform = platform();
      } catch {
        cachedPlatform = "unknown";
      }
    }
  }
  return cachedPlatform;
}

/** True on iOS/iPadOS (and Android). These builds can't compile LaTeX, open external apps, or pick local folders. */
export const IS_IOS = currentPlatform() === "ios";
export const IS_ANDROID = currentPlatform() === "android";
export const IS_MOBILE_OS = IS_IOS || IS_ANDROID;

/**
 * Desktop-only features: compilación LOCAL de LaTeX, "abrir con…", carpeta
 * local del proyecto. En el navegador no existen (ahí compila el servidor).
 */
export const SUPPORTS_LOCAL_TOOLS = IS_TAURI && !IS_MOBILE_OS;

export const IS_MACOS = currentPlatform() === "macos";
export const IS_WINDOWS = currentPlatform() === "windows";
