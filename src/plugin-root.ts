import path from "node:path";
import { fileURLToPath } from "node:url";

export function getPluginRoot(importMetaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}
