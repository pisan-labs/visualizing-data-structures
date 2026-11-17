/**
 * App events for the HintWise first-party analytics (public/hw-events.js,
 * loaded by index.html as app `stepwise`). The page path already names the
 * visualization, so props only say what happened. A no-op when the script is
 * absent (tests, offline, Global Privacy Control, Do Not Track).
 */
export type EventProps = Record<string, string | number | boolean>;

interface HintwiseGlobal {
  hintwise?: { track?: (name: string, props?: EventProps) => void };
}

export function track(name: string, props?: EventProps): void {
  try {
    (globalThis as HintwiseGlobal).hintwise?.track?.(name, props);
  } catch {
    // analytics must never break the page
  }
}
