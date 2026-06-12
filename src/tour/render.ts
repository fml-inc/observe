import pc from "picocolors";
import type { TourLesson } from "./lessons.js";

/**
 * The inline-span grammar — single source of truth shared by styling and by
 * wrapping (spans must stay atomic across line breaks) so the two can never
 * drift apart: **bold** (which may nest `code`) and `code`.
 */
// Bold content must not start or end with whitespace, so space-adjacent
// `**` pairs in prose (e.g. "2 ** 3 and 4 ** 5") are left alone instead of
// being silently consumed as a bold span.
const BOLD_SPAN = /\*\*(\S(?:[^*]*\S)?)\*\*/g;
const CODE_SPAN = /`([^`]+)`/g;
const INLINE_SPANS = new RegExp(
  `${BOLD_SPAN.source}|${CODE_SPAN.source}`,
  "g",
);

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

/** Inline markdown styling. Applied after wrapping is wrong (ANSI codes
 * inflate length), so we wrap on the raw text — close enough for tour copy,
 * which keeps inline spans short. Bold first so `code` nested in a bold span
 * is styled too. */
function inline(text: string): string {
  return text
    .replace(BOLD_SPAN, (_, s: string) => pc.bold(s))
    .replace(CODE_SPAN, (_, s: string) => pc.cyan(s));
}

/** Placeholder for spaces inside inline spans while wrapping. Control bytes
 * are stripped from lesson content at parse time, so NUL cannot collide with
 * copy; it is not \s, so wrap() treats a span as one word, and it has the
 * same display width as a space, so wrap math stays exact. */
const SPAN_SPACE = "\u0000";

/**
 * Wraps prose while keeping inline spans atomic: a span that straddled a
 * wrap point would leave unpaired markers that inline() (applied per line)
 * mis-pairs with the next span. Spaces inside spans are swapped for a
 * placeholder before wrapping and restored on each wrapped line.
 */
function wrapProse(text: string, width: number): string[] {
  // Protect ALL whitespace inside spans (wrap() splits on \s+, so a tab
  // inside a span would still break atomicity if only spaces were swapped).
  const protectedText = text.replace(INLINE_SPANS, (span) =>
    span.replace(/\s/g, SPAN_SPACE),
  );
  return wrap(protectedText, width).map((line) =>
    line.replaceAll(SPAN_SPACE, " "),
  );
}

/**
 * Splits markdown into blocks on blank lines — except inside ``` fences,
 * where blank lines belong to the code block (a naive split on \n{2,}
 * renders the fence tail as prose and leaks the closing fence).
 */
function splitBlocks(md: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  };
  for (const line of md.split("\n")) {
    if (line.startsWith("```")) {
      if (!inFence) flush();
      current.push(line);
      if (inFence) flush();
      inFence = !inFence;
    } else if (!inFence && line.trim() === "") {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

interface ListItem {
  marker: string;
  text: string;
}

/** Lines that don't start a new item continue the previous one (an author
 * hard-wrapping a bullet must not silently lose the continuation text).
 * New items must start at column 0 — an indented "2024. It got faster."
 * continuation is text, not a numbered item. */
function parseListItems(block: string): ListItem[] {
  const items: ListItem[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^(?:[-*]|(\d+)\.)\s+(.*)$/);
    if (m) {
      items.push({ marker: m[1] ? `${m[1]}.` : "•", text: m[2] });
    } else if (items.length > 0) {
      items[items.length - 1].text += ` ${line.trim()}`;
    }
  }
  return items;
}

/**
 * Renders the markdown subset used by tour lessons: paragraphs, `- ` bullets,
 * numbered lists, and ``` fences. Anything fancier is not supported on
 * purpose. Fences must be unindented and closed (an indented fence under a
 * list item folds into the bullet text; an unclosed fence swallows the rest
 * of the lesson) — shipped-lessons tests enforce both for packaged content.
 */
export function renderMarkdown(md: string, width: number): string {
  const out: string[] = [];
  for (const block of splitBlocks(md)) {
    if (block.startsWith("```")) {
      const code = block.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
      for (const line of code.split("\n")) out.push(pc.cyan(`    ${line}`));
    } else if (/^([-*]|\d+\.)\s/.test(block)) {
      for (const { marker, text } of parseListItems(block)) {
        const prefix = `  ${marker} `;
        const indent = " ".repeat(prefix.length);
        const wrapped = wrapProse(text, width - prefix.length);
        out.push(`${prefix}${inline(wrapped[0] ?? "")}`);
        for (const cont of wrapped.slice(1)) out.push(`${indent}${inline(cont)}`);
      }
    } else {
      for (const line of wrapProse(block.replace(/\n/g, " "), width))
        out.push(inline(line));
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/**
 * Clamps a rendered lesson to the terminal height. The alternate screen has
 * no scrollback, so content taller than the window would scroll the header
 * off irrecoverably; instead keep the top visible, truncate the body with a
 * marker, and always keep the footer (the last two lines: rule + nav) on
 * screen. The resize handler redraws, so "resize taller" works live.
 */
export function fitToHeight(rendered: string, rows: number): string {
  const lines = rendered.split("\n");
  if (lines.length <= rows) return rendered;
  const footer = lines.slice(-2);
  const marker = pc.dim("  ⋯ resize taller to see the rest");
  const keep = Math.max(rows - 3, 1);
  return [...lines.slice(0, keep), marker, ...footer].join("\n");
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
    `enter next · p prev · 1-${total} jump · q quit`,
  );
  parts.push("", rule, footer);
  return parts.join("\n");
}
