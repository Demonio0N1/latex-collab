import { platform } from "@tauri-apps/plugin-os";

let cachedPlatform: string | null = null;

function currentPlatform(): string {
  if (cachedPlatform === null) {
    try {
      cachedPlatform = platform();
    } catch {
      cachedPlatform = "unknown";
    }
  }
  return cachedPlatform;
}

/** True on iOS/iPadOS (and Android). These builds can't compile LaTeX, open external apps, or pick local folders. */
export const IS_IOS = currentPlatform() === "ios";
export const IS_ANDROID = currentPlatform() === "android";
export const IS_MOBILE_OS = IS_IOS || IS_ANDROID;

/** Desktop-only features: local LaTeX compilation, "open with…", and choosing a local project folder. */
export const SUPPORTS_LOCAL_TOOLS = !IS_MOBILE_OS;
