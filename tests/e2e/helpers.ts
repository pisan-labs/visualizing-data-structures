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
