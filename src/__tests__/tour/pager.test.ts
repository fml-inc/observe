import { describe, it, expect } from "vitest";
import { reducePager, type PagerState } from "../../tour/pager.js";
import { ADVANCE_KEYS } from "../../commands/tour.js";

const at = (index: number): PagerState => ({ index, exited: false });

describe("reducePager (8 lessons)", () => {
  const TOTAL = 8;

  it("advances on return, space, right, n", () => {
    for (const key of ["return", "space", "right", "n"]) {
      expect(reducePager(at(0), TOTAL, key)).toEqual(at(1));
    }
  });

  it("exits when advancing past the last lesson", () => {
    expect(reducePager(at(7), TOTAL, "return")).toEqual({
      index: 7,
      exited: true,
    });
  });

  it("goes back on p and left, clamped at 0", () => {
    expect(reducePager(at(3), TOTAL, "p")).toEqual(at(2));
    expect(reducePager(at(0), TOTAL, "left")).toEqual(at(0));
  });

  it("jumps on digits 1-8, ignores out-of-range digits", () => {
    expect(reducePager(at(0), TOTAL, "5")).toEqual(at(4));
    expect(reducePager(at(0), TOTAL, "9")).toEqual(at(0));
    expect(reducePager(at(0), TOTAL, "0")).toEqual(at(0));
  });

  it("exits on q and escape", () => {
    expect(reducePager(at(2), TOTAL, "q")).toEqual({ index: 2, exited: true });
    expect(reducePager(at(2), TOTAL, "escape").exited).toBe(true);
  });

  it("ignores unknown keys", () => {
    expect(reducePager(at(2), TOTAL, "x")).toEqual(at(2));
  });

  it("is inert after exit", () => {
    const done = { index: 2, exited: true };
    expect(reducePager(done, TOTAL, "return")).toEqual(done);
  });

  it("ADVANCE_KEYS mirrors the reducer's advance behavior exactly", () => {
    // tour.ts derives "finished vs quit" from this set; if the reducer
    // gains or loses an advance key without the mirror updating, finishing
    // the tour prints the wrong closing line. Digits are excluded from the
    // probe: they are jump keys, and a jump can coincide with advancing.
    const probeKeys = [
      "return", "space", "right", "left", "up", "down", "escape", "tab",
      ...Array.from("abcdefghijklmnopqrstuvwxyz"),
    ];
    for (const key of probeKeys) {
      const advances = reducePager(at(3), TOTAL, key).index === 4;
      expect(advances, `key "${key}"`).toBe(ADVANCE_KEYS.has(key));
    }
  });
});
