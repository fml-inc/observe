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

function width(): number {
  return Math.min(process.stdout.columns ?? 80, 100);
}

function draw(lessons: TourLesson[], state: PagerState): void {
  process.stdout.write(
    CLEAR + renderLesson(lessons[state.index], state.index, lessons.length, width()) + "\n",
  );
}

export async function handleTour(): Promise<void> {
  const { lessons, skipped } = loadLessons(defaultLessonsDir());
  if (lessons.length === 0) {
    console.error("No tour lessons found. Try reinstalling: npm install -g @fml-inc/fml");
    process.exitCode = 1;
    return;
  }

  // Non-interactive (piped output, CI, agents): print the whole tour.
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    for (const [i, lesson] of lessons.entries()) {
      console.log(renderLesson(lesson, i, lessons.length, 80));
      console.log("");
    }
    return;
  }

  let state: PagerState = { index: 0, exited: false };

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume(); // ensure the stream is flowing — keypress events stall without this
  process.stdout.write(ENTER_ALT);
  draw(lessons, state);

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(EXIT_ALT);
      resolve();
    };

    process.stdin.on(
      "keypress",
      (str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
        if (key.ctrl && key.name === "c") return cleanup();
        const normalized =
          str && /^[1-9]$/.test(str) ? str : (key.name ?? "");
        const next = reducePager(state, lessons.length, normalized);
        if (next.exited) return cleanup();
        if (next.index !== state.index) {
          state = next;
          draw(lessons, state);
        }
      },
    );
  });

  if (skipped.length > 0) {
    console.error(`warn: skipped unparseable lesson files: ${skipped.join(", ")}`);
  }
  console.log("Tour complete. Run `fml tour` anytime, or `/fml:tour` in Claude Code.");
}
