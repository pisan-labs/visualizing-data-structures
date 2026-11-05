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
