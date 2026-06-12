import { describe, it, expect } from "vitest";
import { stripVTControlCharacters as stripAnsi } from "node:util";
import {
  fitToHeight,
  renderMarkdown as renderMarkdownRaw,
  renderLesson as renderLessonRaw,
} from "../../tour/render.js";
import type { TourLesson } from "../../tour/lessons.js";
const renderMarkdown = (md: string, w: number) => stripAnsi(renderMarkdownRaw(md, w));
const renderLesson = (l: TourLesson, i: number, t: number, w: number) =>
  stripAnsi(renderLessonRaw(l, i, t, w));

const lesson: TourLesson = {
  slug: "06-skills",
  title: "Skills",
  order: 6,
  requires: "auth",
  tryCli: "fml skills list",
  body: "Skills are **reusable** knowledge.\n\n- one\n- two\n\n```\nfml skills list\n```",
};

describe("renderMarkdown", () => {
  it("renders bullets with a dot marker", () => {
    expect(renderMarkdown("- one\n- two", 80)).toContain("• one");
  });

  it("indents fenced code blocks and strips the fences", () => {
    const out = renderMarkdown("```\nfml login\n```", 80);
    expect(out).toContain("    fml login");
    expect(out).not.toContain("```");
  });

  it("wraps long paragraphs to width", () => {
    const long = Array(20).fill("word").join(" ");
    const out = renderMarkdown(long, 40);
    for (const line of out.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it("keeps a multi-word code span atomic across a wrap boundary", () => {
    // At width 15, naive wrapping splits between "`abc" and "def`",
    // leaving literal backticks that inline() can no longer pair.
    const out = renderMarkdown("12345678 `abc def` tail", 15);
    expect(out).not.toContain("`");
    const hasContiguousSpan = out
      .split("\n")
      .some((line) => line.includes("abc def"));
    expect(hasContiguousSpan).toBe(true);
  });

  it("keeps a multi-word bold span atomic across a wrap boundary", () => {
    // At width 16, naive wrapping splits between "**abc" and "def**".
    const out = renderMarkdown("12345678 **abc def** tail", 16);
    expect(out).not.toContain("**");
    const hasContiguousSpan = out
      .split("\n")
      .some((line) => line.includes("abc def"));
    expect(hasContiguousSpan).toBe(true);
  });

  it("keeps spans atomic in wrapped list items", () => {
    // List items wrap inside the marker prefix; pick a width that splits the span.
    const out = renderMarkdown("- 12345678 `abc def` tail", 19);
    expect(out).not.toContain("`");
    const hasContiguousSpan = out
      .split("\n")
      .some((line) => line.includes("abc def"));
    expect(hasContiguousSpan).toBe(true);
  });

  it("keeps blank lines inside code fences as part of the fence", () => {
    const out = renderMarkdown("```\nfml a\n\nfml b\n```", 80);
    expect(out).toContain("    fml a");
    expect(out).toContain("    fml b");
    expect(out).not.toContain("```");
  });

  it("keeps fences with list-like tails intact after a blank line", () => {
    const out = renderMarkdown("```\nfml a\n\n- not a bullet\n```", 80);
    expect(out).toContain("    - not a bullet");
    expect(out).not.toContain("```");
  });

  it("appends hard-wrapped continuation lines to their list item", () => {
    const out = renderMarkdown("- item one\n  continued text here\n- item two", 80);
    expect(out).toContain("• item one continued text here");
    expect(out).toContain("• item two");
  });

  const LONG_NUMBERED_ITEM = `1. ${Array(20).fill("word").join(" ")}`;

  it("keeps numbered-list lines within width", () => {
    const out = renderMarkdown(LONG_NUMBERED_ITEM, 40);
    for (const line of out.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it("aligns continuation lines under the item text", () => {
    const out = renderMarkdown(LONG_NUMBERED_ITEM, 40);
    const lines = out.split("\n").filter(Boolean);
    expect(lines[0].startsWith("  1. word")).toBe(true);
    expect(lines[1].startsWith("     word")).toBe(true);
  });

  it("treats an indented digit-leading line as continuation, not a new item", () => {
    const out = renderMarkdown("- shipped in\n  2024. It got faster.", 80);
    expect(out).toContain("• shipped in 2024. It got faster.");
    const bogusItem = out.split("\n").some((l) => l.trim().startsWith("2024."));
    expect(bogusItem).toBe(false);
  });

  it("keeps spans with internal tabs atomic across wraps", () => {
    const out = renderMarkdown("12345678 `abc\tdef` tail", 15);
    expect(out).not.toContain("`");
  });

  it("leaves space-adjacent ** pairs in prose alone", () => {
    const out = renderMarkdown("compute 2 ** 3 and 4 ** 5 done", 80);
    expect(out).toContain("compute 2 ** 3 and 4 ** 5 done");
  });
});

describe("fitToHeight", () => {
  const tall = Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n");

  it("returns short content unchanged", () => {
    expect(fitToHeight("a\nb\nc", 24)).toBe("a\nb\nc");
  });

  it("clamps tall content keeping the top and the 2-line footer", () => {
    const out = stripAnsi(fitToHeight(tall, 24)).split("\n");
    expect(out).toHaveLength(24);
    expect(out[0]).toBe("line0");
    expect(out[21]).toContain("resize taller");
    expect(out[22]).toBe("line28");
    expect(out[23]).toBe("line29");
  });
});

describe("renderLesson", () => {
  const screen = renderLesson(lesson, 5, 8, 80);

  it("shows the header with position and title", () => {
    expect(screen).toContain("How FML Works");
    expect(screen).toContain("Lesson 6/8: Skills");
  });

  it("shows the try-it line when tryCli is present", () => {
    expect(screen).toContain("Try it:");
    expect(screen).toContain("fml skills list");
  });

  it("shows the navigation footer", () => {
    expect(screen).toContain("enter next · p prev · 1-8 jump · q quit");
  });

  it("omits the try-it line when absent", () => {
    const bare = renderLesson({ ...lesson, tryCli: undefined }, 5, 8, 80);
    expect(bare).not.toContain("Try it:");
  });
});
