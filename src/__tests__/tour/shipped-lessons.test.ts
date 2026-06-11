import { describe, it, expect } from "vitest";
import { defaultLessonsDir, loadLessons } from "../../tour/lessons.js";

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
});
