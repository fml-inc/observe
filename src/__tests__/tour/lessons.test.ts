import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseLesson, loadLessons } from "../../tour/lessons.js";

const VALID = `---
title: Skills
order: 6
requires: auth
tryClaude: Call fml_list_skills and summarize.
tryCli: fml skills list
---
Body text here.

More body.`;

describe("parseLesson", () => {
  it("parses a full lesson", () => {
    const lesson = parseLesson("06-skills", VALID);
    expect(lesson).toEqual({
      slug: "06-skills",
      title: "Skills",
      order: 6,
      requires: "auth",
      tryClaude: "Call fml_list_skills and summarize.",
      tryCli: "fml skills list",
      body: "Body text here.\n\nMore body.",
    });
  });

  it("defaults requires to none and try fields to undefined", () => {
    const lesson = parseLesson("01-x", "---\ntitle: Hi\norder: 1\n---\nBody.");
    expect(lesson?.requires).toBe("none");
    expect(lesson?.tryClaude).toBeUndefined();
    expect(lesson?.tryCli).toBeUndefined();
  });

  it("returns null when title is missing", () => {
    expect(parseLesson("x", "---\norder: 1\n---\nBody.")).toBeNull();
  });

  it("returns null when order is not an integer", () => {
    expect(parseLesson("x", "---\ntitle: Hi\norder: nope\n---\nBody.")).toBeNull();
  });

  it("returns null on unknown requires value", () => {
    expect(
      parseLesson("x", "---\ntitle: Hi\norder: 1\nrequires: sudo\n---\nBody."),
    ).toBeNull();
  });

  it("returns null when frontmatter is absent", () => {
    expect(parseLesson("x", "just text")).toBeNull();
  });
});

describe("loadLessons", () => {
  it("loads .md files sorted by order and reports skipped files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tour-"));
    writeFileSync(path.join(dir, "b.md"), "---\ntitle: Two\norder: 2\n---\nB");
    writeFileSync(path.join(dir, "a.md"), "---\ntitle: One\norder: 1\n---\nA");
    writeFileSync(path.join(dir, "bad.md"), "no frontmatter");
    writeFileSync(path.join(dir, "notes.txt"), "ignored");
    const { lessons, skipped } = loadLessons(dir);
    expect(lessons.map((l) => l.title)).toEqual(["One", "Two"]);
    expect(skipped).toEqual(["bad.md"]);
  });

  it("returns empty results for an empty directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tour-empty-"));
    mkdirSync(dir, { recursive: true });
    expect(loadLessons(dir)).toEqual({ lessons: [], skipped: [] });
  });

  it("returns empty results for a missing directory instead of throwing", () => {
    expect(loadLessons("/nonexistent/tour-dir")).toEqual({
      lessons: [],
      skipped: [],
    });
  });
});
