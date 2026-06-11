import readline from "node:readline";
import {
  defaultLessonsDir,
  loadLessons,
  type TourLesson,
} from "../tour/lessons.js";
import { reducePager, type PagerState } from "../tour/pager.js";
import { renderLesson } from "../tour/render.js";

const ENTER_ALT = "\x1b[?1049h\x1b[?25l";
const EXIT_ALT = "\x1b[?25h\x1b[?1049l";
const CLEAR = "\x1b[2J\x1b[H";

// Keys that advance — mirrored from the reducer so "finished the last
// lesson" (advance past the end) is distinguishable from "quit" (q/escape).
const ADVANCE_KEYS = new Set(["return", "space", "right", "n"]);

const CLOSING_HINT = "Run `fml tour` anytime, or `/fml:tour` in Claude Code.";

function width(): number {
  // columns can be 0 on PTYs that never set a window size — treat that as
  // unknown; floor the result so narrow panes stay readable.
  const cols = process.stdout.columns || 80;
  return Math.max(Math.min(cols, 100), 40);
}

function draw(lessons: TourLesson[], state: PagerState): void {
  process.stdout.write(
    CLEAR + renderLesson(lessons[state.index], state.index, lessons.length, width()) + "\n",
  );
}

export async function handleTour(): Promise<void> {
  const { lessons, skipped } = loadLessons(defaultLessonsDir());
  if (skipped.length > 0) {
    console.error(`warn: skipped unparseable lesson files: ${skipped.join(", ")}`);
  }
  if (lessons.length === 0) {
    console.error("No tour lessons found. Try reinstalling: npm install -g @fml-inc/fml");
    process.exitCode = 1;
    return;
  }

  // Non-interactive (piped output, CI, agents) or a terminal that can't
  // interpret the pager's escape sequences: print the whole tour.
  if (
    !process.stdout.isTTY ||
    !process.stdin.isTTY ||
    process.env.TERM === "dumb"
  ) {
    for (const [i, lesson] of lessons.entries()) {
      console.log(renderLesson(lesson, i, lessons.length, 80));
      console.log("");
    }
    return;
  }

  let state: PagerState = { index: 0, exited: false };
  let finished = false; // advanced past the last lesson, vs. quit
  let interrupted = false; // Ctrl+C

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume(); // ensure the stream is flowing — keypress events stall without this
  process.stdout.write(ENTER_ALT);

  // Raw mode and the alternate screen must be unwound on every exit path —
  // including signals and crashes the keypress loop never sees. Idempotent,
  // and registered on 'exit' so even an uncaught throw restores the terminal.
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(EXIT_ALT);
  };
  process.once("exit", restore);

  try {
    draw(lessons, state);

    await new Promise<void>((resolve, reject) => {
      const onResize = () => draw(lessons, state);

      const teardown = () => {
        // Mark exited so keypresses already parsed from the same stdin chunk
        // (e.g. a pasted "q2") can't redraw onto the restored main screen.
        state = { ...state, exited: true };
        process.stdin.off("keypress", onKeypress);
        process.stdout.off("resize", onResize);
        process.off("SIGTERM", onSignal);
        process.off("SIGHUP", onSignal);
        process.off("SIGINT", onSignal);
        process.off("SIGBREAK", onSignal);
        restore();
      };

      const onSignal = (signal: NodeJS.Signals) => {
        teardown();
        // Re-raise so the exit status reflects the signal.
        process.kill(process.pid, signal);
      };

      const onKeypress = (
        str: string | undefined,
        key: { name?: string; ctrl?: boolean },
      ) => {
        if (state.exited) return;
        try {
          if (key.ctrl && key.name === "c") {
            interrupted = true;
            teardown();
            return resolve();
          }
          const normalized = str && /^[1-9]$/.test(str) ? str : (key.name ?? "");
          const next = reducePager(state, lessons.length, normalized);
          if (next.exited) {
            finished =
              ADVANCE_KEYS.has(normalized) && state.index === lessons.length - 1;
            teardown();
            return resolve();
          }
          if (next.index !== state.index) {
            state = next;
            draw(lessons, state);
          }
        } catch (err) {
          // Reject (rather than crash the emitter) so the CLI's central
          // error handling sees the failure after the terminal is restored.
          teardown();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      process.stdin.on("keypress", onKeypress);
      process.stdout.on("resize", onResize);
      process.on("SIGTERM", onSignal);
      process.on("SIGHUP", onSignal);
      process.on("SIGINT", onSignal);
      process.on("SIGBREAK", onSignal);
    });
  } finally {
    restore();
    process.off("exit", restore);
  }

  if (interrupted) {
    process.exitCode = 130;
    return;
  }
  console.log(finished ? `Tour complete. ${CLOSING_HINT}` : CLOSING_HINT);
}
