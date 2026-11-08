/**
 * The stage's zoom buttons, in CSS pixels: the one place their size is set. src/ui/Stage.svelte
 * draws them from these numbers, and layouts read the same numbers to keep drawings clear of them.
 */
import type { StageSize } from '../engine/types';

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
