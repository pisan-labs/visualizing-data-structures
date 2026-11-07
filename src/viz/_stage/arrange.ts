/**
 * Arranging a drawing for the stage it is drawn on, for pages whose parts can sit side by side
 * on a wide laptop stage and one under another on a tall phone stage. Views get the stage's
 * size (`view(step, settings, stage)`), build each arrangement's bounds, and `pickLayout` keeps
 * the one drawn largest. With no stage (tests, thumbnails, practice pictures) it keeps the
 * first, the page's usual arrangement, so those pictures do not change.
 *
 * Decide from sizes that hold for a whole operation (the finished tree, the reserved room),
 * never from what the current step happens to show, so the drawing does not jump mid-run.
 *
 * This is a page-local helper for now; it belongs beside fitScore and placePanels in
 * src/layouts once that folder is free to change.
 */
import type { StageSize } from '../../engine/types';
import { fitScore } from '../../layouts/graph';
import type { Bounds, Shape } from '../../render/scene';

/**
 * The arrangement drawn largest on `stage`, or the first one when there is no stage. Another
 * must beat the first by 5% to win, so a near tie keeps the usual arrangement.
 */
export function pickLayout<T extends { bounds: Bounds }>(
  stage: StageSize | undefined,
  options: readonly T[],
): T {
  let best = options[0]!;
  if (!stage) return best;
  let score = fitScore(best.bounds, stage) * 1.05;
  for (const o of options.slice(1)) {
    const s = fitScore(o.bounds, stage);
    if (s > score) {
      best = o;
      score = s;
    }
  }
  return best;
}

/** Pixels per scene unit for these bounds on `stage`. */
export const stageScale = (b: Bounds, stage: StageSize): number => fitScore(b, stage);

/**
 * Shapes moved by (dx, dy). Unlike graph.ts's translate, where a shape slides in from moves too:
 * here the whole part moves, the place it slides in from included.
 */
export function translate(shapes: Shape[], dx: number, dy: number): Shape[] {
  if (!dx && !dy) return shapes;
  return shapes.map((s) => {
    const from = s.enterFrom ? { enterFrom: { x: s.enterFrom.x + dx, y: s.enterFrom.y + dy } } : {};
    if (s.kind === 'arrow')
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy, ...from };
    if (s.kind === 'polygon')
      return { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })), ...from };
    return { ...s, x: s.x + dx, y: s.y + dy, ...from };
  });
}

export interface PanelPlace {
  /** Move the panel's shapes by this much. */
  dx: number;
  dy: number;
  bounds: Bounds;
  beside: boolean;
}

/**
 * A view that draws its panel (matrices, a legend, a list) under its main picture can offer the
 * panel beside it instead: right of `main`, its top `drop` units under the main picture's top,
 * clear of the stage's zoom buttons. `usual` is the scene's bounds with the panel under; `panel`
 * is the panel's box there. Beside, the bounds keep `usual`'s top left corner and its margins
 * (`pad` right and below). With no stage, or when beside is not clearly larger, nothing moves.
 */
export function panelPlace(
  stage: StageSize | undefined,
  usual: Bounds,
  main: Bounds,
  panel: Bounds,
  o: { gap?: number; drop?: number; pad?: number } = {},
): PanelPlace {
  const under: PanelPlace = { dx: 0, dy: 0, bounds: usual, beside: false };
  if (!stage) return under;
  const gap = o.gap ?? 30;
  const drop = o.drop ?? 34;
  const pad = o.pad ?? 14;
  const dx = main.x + main.w + gap - panel.x;
  const dy = main.y + drop - panel.y;
  const right = Math.max(main.x + main.w, panel.x + panel.w + dx) + pad;
  const bottom = Math.max(main.y + main.h, panel.y + panel.h + dy) + pad;
  const beside: PanelPlace = {
    dx,
    dy,
    bounds: { x: usual.x, y: usual.y, w: right - usual.x, h: bottom - usual.y },
    beside: true,
  };
  return pickLayout(stage, [under, beside]);
}
