import { describe, it, expect } from "vitest";
import { stripVTControlCharacters as stripAnsi } from "node:util";
import { defaultLessonsDir, loadLessons } from "../../tour/lessons.js";
import { renderLesson } from "../../tour/render.js";

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
    // 20 is the runtime floor in src/commands/tour.ts; sweep from there.
    for (const [i, lesson] of lessons.entries()) {
      for (let width = 20; width <= 100; width++) {
        const out = stripAnsi(renderLesson(lesson, i, lessons.length, width));
        expect(out, `${lesson.slug} at width ${width}`).not.toContain("`");
        expect(out, `${lesson.slug} at width ${width}`).not.toContain("**");
      }
    }
  });

  it("every code fence is closed and unindented", () => {
    // The renderer's documented subset: an unclosed fence swallows the rest
    // of the lesson; an indented fence folds into the surrounding text.
    for (const lesson of lessons) {
      const lines = lesson.body.split("\n");
      const fences = lines.filter((l) => l.startsWith("```"));
      expect(fences.length % 2, `${lesson.slug}: unclosed fence`).toBe(0);
      const indented = lines.filter((l) => /^\s+```/.test(l));
      expect(indented, `${lesson.slug}: indented fence`).toEqual([]);
    }
  });

  it("inline spans fit within the supported width band", () => {
    // Atomic spans never split, so a span longer than the wrap width
    // overflows the line. Keep prose spans (fences excluded — they don't
    // wrap) short enough for narrow terminals.
    for (const lesson of lessons) {
      const prose = lesson.body.replace(/```[^]*?```/g, "");
      for (const span of prose.match(/\*\*[^*\n]+\*\*|`[^`\n]+`/g) ?? []) {
        expect(
          span.length,
          `${lesson.slug}: span too long to wrap: ${span}`,
        ).toBeLessThanOrEqual(40);
      }
    }
  });
});
