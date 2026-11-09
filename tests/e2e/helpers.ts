import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Click a "Show me" button or link and check that it played. Playback can finish before the
 * test looks (a short answer plays in a step or two), so either counts: the Pause button is
 * showing, or the timeline changed and stands at its last step.
 */
export async function showMe(page: Page, trigger: Locator): Promise<void> {
  const timeline = page.getByRole('slider', { name: 'Timeline' });
  const pause = page.getByRole('button', { name: 'Pause' });
  const before = (await timeline.count()) ? await timeline.getAttribute('aria-valuetext') : null;
  await trigger.click();
  await expect
    .poll(async () => {
      if (await pause.isVisible()) return 'played';
      if (!(await timeline.count())) return 'no timeline';
      const now = await timeline.getAttribute('aria-valuetext');
      const m = now?.match(/^Step (\d+) of (\d+)$/);
      return now !== before && m && m[1] === m[2] ? 'played' : `still at ${now}`;
    })
    .toBe('played');
}

/**
 * An operation button of the page's controls. Less common operations sit under "More
 * operations"; when the button is one of them, the fold-out is opened first.
 */
export async function opButton(page: Page, name: string): Promise<Locator> {
  const form = page.locator('form.controls');
  const more = form.locator('details.more');
  const folded = more.getByRole('button', { name, exact: true, includeHidden: true });
  if ((await folded.count()) && !(await more.evaluate((d) => (d as HTMLDetailsElement).open)))
    await more.locator('summary').click();
  return form.getByRole('button', { name, exact: true });
}

/**
 * Wait until the drawing stops moving: playback finished, no CSS transitions running, and the
 * stage markup unchanged for a few frames. Axe measures colors as drawn, so a shape caught
 * mid-fade can fail contrast. The viewBox counts too: the camera tweens to a new framing, and it
 * is an attribute of the svg element, outside its innerHTML.
 *
 * Playback matters because an operation plays its steps one by one on a timer, and each step's
 * tween is shorter than the timer: between two steps nothing moves for a moment, and a check
 * made then sees a step that is about to change. While playing, the transport's play button
 * reads "Pause".
 */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((done) => {
        const snap = () =>
          Array.from(document.querySelectorAll('svg'))
            .map((s) => `${s.getAttribute('viewBox')}${s.innerHTML}`)
            .join('|');
        const before = snap();
        let frames = 0;
        const tick = () => {
          if (++frames < 8) return requestAnimationFrame(tick);
          const playing = document.querySelector('button[aria-label="Pause"]') !== null;
          done(!playing && document.getAnimations().length === 0 && snap() === before);
        };
        requestAnimationFrame(tick);
      }),
    undefined,
    { polling: 100, timeout: 10_000 },
  );
}

interface AxeNode {
  target: unknown[];
  html: string;
  failureSummary?: string;
}

/**
 * What an axe scan found, one line per failing element: the rule, the element's selector, its
 * HTML and axe's reason (for color contrast, the two colors and the ratio). Expect it to equal
 * []. A count alone hid which element failed when a scan failed once and never again.
 */
export function axeFindings(results: { violations: { id: string; nodes: AxeNode[] }[] }): string[] {
  return results.violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id}: ${n.target.join(' ')} ${n.html.slice(0, 160)} ${(n.failureSummary ?? '').replace(/\s+/g, ' ')}`,
    ),
  );
}

/**
 * The link to a page with nothing in it: an example with no operations. A page with an `opening`
 * otherwise arrives full, and tests that build from empty load this instead.
 */
export function emptyStart(id: string): string {
  const json = JSON.stringify({ format: 1, viz: id, ops: [] });
  return `/${id}/#ex=j${Buffer.from(json).toString('base64url')}`;
}
