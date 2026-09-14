import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Dev storage writes to .data/media. Swap this one module for R2 in production —
 * nothing else in the app knows where bytes live.
 */
const ROOT = path.resolve(process.env.FR_MEDIA_ROOT ?? path.join(process.cwd(), ".data", "media"));

export async function putObject(key: string, body: Buffer): Promise<string> {
  const full = path.resolve(ROOT, key);
  // A key is a storage path, not a filesystem path. Refuse anything that walks
  // out of ROOT rather than trusting every caller to have sanitised it.
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    throw new Error("invalid storage key");
  }
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
  return key;
}

export function publicUrl(key: string): string {
  return `/api/media/${encodeURIComponent(key)}`;
}
