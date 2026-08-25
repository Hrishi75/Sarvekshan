import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Dev storage writes to .data/media. Swap this one module for R2 in production —
 * nothing else in the app knows where bytes live.
 */
const ROOT = path.join(process.cwd(), ".data", "media");

export async function putObject(key: string, body: Buffer): Promise<string> {
  const full = path.join(ROOT, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
  return key;
}

export function publicUrl(key: string): string {
  return `/api/media/${encodeURIComponent(key)}`;
}
