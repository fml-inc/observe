import pc from "picocolors";
import type { TourLesson } from "./lessons.js";

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Inline markdown: **bold** and `code`. Applied after wrapping is wrong
 * (ANSI codes inflate length), so we wrap on the raw text — close enough
 * for tour copy, which keeps inline spans short. */
function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, (_, s: string) => pc.bold(s))
    .replace(/`([^`]+)`/g, (_, s: string) => pc.cyan(s));
}

/** Placeholder for spaces inside inline spans while wrapping. NUL cannot
 * appear in lesson copy, and it is not \s, so wrap() treats a span as one
 * word. Same display width as a space, so wrap math stays exact. */
const SPAN_SPACE = "\u0000";

/**
 * Wraps prose while keeping `code` and **bold** spans atomic: a span that
 * straddled a wrap point would leave unpaired markers that inline() (applied
 * per line) mis-pairs with the next span. Spaces inside spans are swapped
 * for a placeholder before wrapping and restored on each wrapped line.
 */
function wrapProse(text: string, width: number): string[] {
  const protectedText = text.replace(/\*\*[^*]+\*\*|`[^`]+`/g, (span) =>
    span.replaceAll(" ", SPAN_SPACE),
  );
  return wrap(protectedText, width).map((line) =>
    line.replaceAll(SPAN_SPACE, " "),
  );
}

/**
 * Renders the markdown subset used by tour lessons: paragraphs, `- ` bullets,
 * numbered lists, and ``` fences. Anything fancier is not supported on purpose.
 */
export function renderMarkdown(md: string, width: number): string {
  const out: string[] = [];
  const blocks = md.split(/\n{2,}/);
  for (const block of blocks) {
    if (block.startsWith("```")) {
      const code = block.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
      for (const line of code.split("\n")) out.push(pc.cyan(`    ${line}`));
    } else if (/^(\s*[-*]|\s*\d+\.)\s/.test(block)) {
      for (const item of block.split("\n")) {
        const m = item.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/);
        if (!m) continue;
        const marker = m[1] ? `${m[1]}.` : "•";
        const wrapped = wrapProse(m[2], width - 4);
        out.push(`  ${marker} ${inline(wrapped[0] ?? "")}`);
        for (const cont of wrapped.slice(1))
          out.push(`    ${inline(cont)}`);
      }
    } else {
      for (const line of wrapProse(block.replace(/\n/g, " "), width))
        out.push(inline(line));
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

export function renderLesson(
  lesson: TourLesson,
  index: number,
  total: number,
  width: number,
): string {
  const header = `${pc.bold("How FML Works")}  ${pc.dim("—")}  ${pc.blue(
    `Lesson ${index + 1}/${total}: ${lesson.title}`,
  )}`;
  const rule = pc.dim("─".repeat(Math.min(width, 72)));
  const parts = [header, rule, "", renderMarkdown(lesson.body, width)];

  if (lesson.tryCli) {
    parts.push("", `${pc.green("Try it:")} ${pc.cyan(lesson.tryCli)}`);
  }

  const footer = pc.dim(
    `enter next   p prev   1-${total} jump   q quit`,
  );
  parts.push("", rule, footer);
  return parts.join("\n");
}
