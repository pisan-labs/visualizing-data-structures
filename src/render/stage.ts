/**
 * The stage's zoom buttons, in CSS pixels: the one place their size is set. src/ui/Stage.svelte
 * draws them from these numbers, and layouts read the same numbers to keep drawings clear of them.
 * Also the two typical stages, the room a view gets on a laptop and on a phone.
 */
import type { StageSize } from '../engine/types';

/**
 * The room src/ui/Stage.svelte reports to views on a 1366 x 768 laptop (wide and short), in CSS
 * pixels, as measured on the built site on 8 November. The drawing is 884 x 387; the stage
 * rounds to 8. Pages with a second row of controls get less height (336, or 312 for the
 * NP reductions); a taller window gets more (480 at 1366 x 860, the e2e desktop).
 */
export const LAPTOP_STAGE: Readonly<StageSize> = { w: 888, h: 384 };

/**
 * The room on a phone in portrait (a Pixel 7, 412 x 839, as the e2e phone project uses), measured
 * the same way: the drawing is 362 x 537, and the zoom buttons have a strip of their own.
 */
export const PHONE_STAGE: Readonly<StageSize> = { w: 360, h: 536, strip: true };

/**
 * The stages a picture has to read on when a view is given none (catalog thumbnails, practice
 * pictures, tests): `fitScore` in src/layouts/graph.ts scores a scene on the smaller of the two,
 * and src/viz/conformance.test.ts draws every step on each.
 */
export const TYPICAL_STAGES: readonly StageSize[] = [LAPTOP_STAGE, PHONE_STAGE];

/**
 * The stage catalog thumbnails are tried on (src/render/preview.ts keeps this drawing or the one
 * with no stage, whichever is larger in the box): the thumbnail box, 72 x 44, scaled by 10. The
 * shape is what counts, so a page picks its wide arrangement for the wide box; the scale keeps
 * the size in the range of real stages, because some views size things in pixels (how wide a
 * row of roots may grow). A thumbnail has no zoom buttons, so `strip` says they cover none of
 * the drawing (without it, views would keep a 118 x 42 corner clear for buttons that are not
 * there).
 */
export const THUMBNAIL_STAGE: Readonly<StageSize> = { w: 720, h: 440, strip: true };

/** Three square buttons in a row, `gap` apart. */
export const ZOOM_BUTTONS = {
  size: 34,
  gap: 4,
  /**
   * From the stage's top and right edges. The drawing has the same padding, so the buttons are
   * level with its top right corner.
   */
  inset: 8,
} as const;

/** Clear space kept left of and below the buttons. */
const MARGIN = 8;

/**
 * The top right corner of the drawing the buttons cover, with a margin: 118 x 42. Something
 * drawn there sits under the buttons.
 */
export const ZOOM_CORNER = {
  w: 3 * ZOOM_BUTTONS.size + 2 * ZOOM_BUTTONS.gap + MARGIN,
  h: ZOOM_BUTTONS.size + MARGIN,
} as const;

/**
 * On screens up to `maxWidth` wide (phones) the drawing fills the stage's width, so the buttons
 * get a strip of their own instead: the drawing starts `top` below the stage's top edge (under the
 * buttons and a 4 px gap), and the buttons cover none of it. Stage.svelte reports this to views
 * as `StageSize.strip`.
 */
export const ZOOM_STRIP = {
  maxWidth: 600,
  top: ZOOM_BUTTONS.inset + ZOOM_BUTTONS.size + 4,
} as const;

/**
 * In scene units: a block put beside the main picture at the top starts this much lower, which
 * clears the buttons at about one pixel per unit. For views that place blocks without working
 * out the scale; those that do use `zoomCorner`.
 */
export const ZOOM_DROP = ZOOM_BUTTONS.size;

/** The corner the buttons cover on this stage, or null when they have a strip of their own. */
export function zoomCorner(stage: StageSize): { w: number; h: number } | null {
  return stage.strip ? null : ZOOM_CORNER;
}
