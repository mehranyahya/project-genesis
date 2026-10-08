/** Only a decoded, still-current image may replace the visible frame. */
export async function prepareMediaSwap(
  image: { decode: () => Promise<void> },
  isCurrent: () => boolean,
): Promise<boolean> {
  await image.decode();
  return isCurrent();
}

/** Cancelled, failed or retired attempts must never change a newer frame. */
export function createMediaSwapGuard() {
  let sequence = 0;
  let active: number | null = null;
  return {
    start() {
      active = ++sequence;
      return active;
    },
    isCurrent(attempt: number) {
      return active === attempt;
    },
    cancel() {
      active = null;
    },
  };
}
