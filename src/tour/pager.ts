export interface PagerState {
  index: number;
  exited: boolean;
}

/**
 * Pure navigation state machine. `key` is a normalized key name:
 * readline's `key.name` for named keys, or the literal character for digits.
 */
export function reducePager(
  state: PagerState,
  total: number,
  key: string,
): PagerState {
  if (state.exited) return state;

  if (key === "q" || key === "escape") return { ...state, exited: true };

  if (key === "return" || key === "space" || key === "right" || key === "n") {
    if (state.index >= total - 1) return { ...state, exited: true };
    return { ...state, index: state.index + 1 };
  }

  if (key === "p" || key === "left") {
    return { ...state, index: Math.max(0, state.index - 1) };
  }

  if (/^[1-9]$/.test(key)) {
    const target = Number(key) - 1;
    if (target < total) return { ...state, index: target };
  }

  return state;
}
