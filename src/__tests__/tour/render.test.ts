import { describe, it, expect } from "vitest";
import { renderMarkdown as renderMarkdownRaw, renderLesson as renderLessonRaw } from "../../tour/render.js";
import type { TourLesson } from "../../tour/lessons.js";

// eslint-disable-next-line no-control-regex -- stripping ANSI escapes requires matching
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
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
    // List items wrap at width - 4; pick a width that splits the span.
    const out = renderMarkdown("- 12345678 `abc def` tail", 19);
    expect(out).not.toContain("`");
    const hasContiguousSpan = out
      .split("\n")
      .some((line) => line.includes("abc def"));
    expect(hasContiguousSpan).toBe(true);
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
    expect(screen).toContain("enter next");
    expect(screen).toContain("p prev");
    expect(screen).toContain("1-8 jump");
    expect(screen).toContain("q quit");
  });

  it("omits the try-it line when absent", () => {
    const bare = renderLesson({ ...lesson, tryCli: undefined }, 5, 8, 80);
    expect(bare).not.toContain("Try it:");
  });
});
