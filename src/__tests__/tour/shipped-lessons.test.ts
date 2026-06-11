import { describe, it, expect } from "vitest";
import { defaultLessonsDir, loadLessons } from "../../tour/lessons.js";
import { renderLesson } from "../../tour/render.js";

// eslint-disable-next-line no-control-regex -- stripping ANSI escapes requires matching
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("shipped tour lessons", () => {
  // Using defaultLessonsDir() doubles as a test of the path resolver
  // against the real repo layout (it must skip src/tour and find <repo>/tour).
  const { lessons, skipped } = loadLessons(defaultLessonsDir());

  it("all files parse", () => {
    expect(skipped).toEqual([]);
  });

  it("has 8 lessons with orders 1..8", () => {
    expect(lessons.map((l) => l.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("every live demo has a CLI fallback", () => {
    for (const lesson of lessons) {
      if (lesson.tryClaude) expect(lesson.tryCli).toBeTruthy();
    }
  });

  it("gated lessons declare a precondition", () => {
    for (const lesson of lessons) {
      if (lesson.tryClaude) expect(lesson.requires).not.toBe("none");
    }
  });

  it("exactly lessons 2, 4, 5, 6 have live demos", () => {
    const withDemo = lessons.filter((l) => l.tryClaude).map((l) => l.order);
    expect(withDemo).toEqual([2, 4, 5, 6]);
  });

  it("renders without stray markers at every pager width", () => {
    // Inline spans must never straddle a wrap point: a split span leaves
    // literal backticks / ** that mis-pair and bleed color into prose.
    for (const [i, lesson] of lessons.entries()) {
      for (let width = 60; width <= 100; width++) {
        const out = stripAnsi(renderLesson(lesson, i, lessons.length, width));
        expect(out, `${lesson.slug} at width ${width}`).not.toContain("`");
        expect(out, `${lesson.slug} at width ${width}`).not.toContain("**");
      }
    }
  });
});
