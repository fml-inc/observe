import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TourRequires = "none" | "auth" | "synced" | "integration";

const REQUIRES_VALUES: readonly TourRequires[] = [
  "none",
  "auth",
  "synced",
  "integration",
];

export interface TourLesson {
  slug: string;
  title: string;
  order: number;
  requires: TourRequires;
  tryClaude?: string;
  tryCli?: string;
  body: string;
}

/**
 * Frontmatter is a flat `key: value` block — not YAML. Keep lesson files
 * within that subset (no nesting, no multi-line values).
 */
export function parseLesson(slug: string, raw: string): TourLesson | null {
  // Normalize before parsing: strip a UTF-8 BOM, fold CRLF/CR to LF (Windows
  // checkouts with autocrlf garble rendering otherwise), and drop remaining
  // control characters (keeping \n and \t) so lesson content can never write
  // raw escape sequences to the terminal.
  const text = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex -- stripping control bytes requires matching them
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    meta[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }

  // Strictly digits: Number("") is 0 and Number("0x2") is 2, both of which
  // would otherwise pass an integer check for malformed frontmatter.
  const requires = (meta.requires ?? "none") as TourRequires;
  if (
    !meta.title ||
    !/^\d+$/.test(meta.order ?? "") ||
    !REQUIRES_VALUES.includes(requires)
  ) {
    return null;
  }
  const order = Number(meta.order);

  return {
    slug,
    title: meta.title,
    order,
    requires,
    tryClaude: meta.tryClaude || undefined,
    tryCli: meta.tryCli || undefined,
    body: match[2].trim(),
  };
}

export interface LoadResult {
  lessons: TourLesson[];
  skipped: string[];
}

export function loadLessons(dir: string): LoadResult {
  // Guard: a packaging miss or bad path must surface as "no lessons found"
  // (handled by the caller), not an ENOENT crash.
  if (!fs.existsSync(dir)) return { lessons: [], skipped: [] };
  const lessons: TourLesson[] = [];
  const skipped: string[] = [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    const lesson = parseLesson(file.replace(/\.md$/, ""), raw);
    if (lesson) lessons.push(lesson);
    else skipped.push(file);
  }
  lessons.sort((a, b) => a.order - b.order);
  return { lessons, skipped };
}

/** `<pkg>/tour`, resolved relative to the built file (dist/ or src/tour/). */
export function defaultLessonsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/cli.js → ../tour ; src/tour/lessons.ts → ../../tour.
  // Probe for actual lesson files: from src/tour, "../tour" resolves to
  // src/tour itself (exists, but holds .ts not .md), so existence alone
  // is not enough.
  const candidates = [
    path.resolve(here, "../tour"),
    path.resolve(here, "../../tour"),
  ];
  for (const dir of candidates) {
    if (
      fs.existsSync(dir) &&
      fs.readdirSync(dir).some((f) => f.endsWith(".md"))
    ) {
      return dir;
    }
  }
  return candidates[0];
}
