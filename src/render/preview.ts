import { normalizeSettings } from '../engine/example';
import { Timeline } from '../engine/timeline';
import type { AnyVizDef } from '../engine/types';
import { shapesBounds, type Bounds, type Shape } from './scene';

/**
 * A small looping animation for the catalog: the steps of one curated example, stripped to bare
 * shapes. Text is dropped (it is unreadable at thumbnail size) and one fixed frame holds every
 * step, so the camera stays still while the structure grows and moves.
 */
export interface Preview {
  bounds: Bounds;
  frames: Shape[][];
  /** The frame shown at rest: the fullest one (the latest of equals), not an emptied end state. */
  poster: number;
}

/** The most frames a preview keeps; longer examples are sampled evenly, keeping the last. */
export const MAX_FRAMES = 24;

/**
 * Shape ids every preview leaves out: the boxes that hold an operation's input and output. They
 * carry text, so stripped they are empty frames.
 */
export const DEFAULT_HIDE = ['arg-box', 'in-box', 'out-box', 'key-box', 'result-box'];

const round = (v: number) => Math.round(v * 10) / 10;

/** Drop text, round coordinates (the JSON is served to every visitor), keep identity and role. */
function strip(shapes: Shape[], hide: string[]): Shape[] {
  const out: Shape[] = [];
  for (const s of shapes) {
    if (s.kind === 'text' || (s.opacity ?? 1) <= 0) continue;
    if (hide.some((h) => s.id.startsWith(h))) continue;
    const c = { ...s } as Record<string, unknown>;
    for (const k of ['x', 'y', 'w', 'h', 'r', 'x1', 'y1', 'x2', 'y2']) {
      if (typeof c[k] === 'number') c[k] = round(c[k] as number);
    }
    if (s.kind === 'polygon') c.points = s.points.map((q) => ({ x: round(q.x), y: round(q.y) }));
    if (s.enterFrom) c.enterFrom = { x: round(s.enterFrom.x), y: round(s.enterFrom.y) };
    out.push(c as unknown as Shape);
  }
  return out;
}

function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from(
    { length: n },
    (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]!,
  );
}

/** The preview a page asks for with `preview`, or null if it asks for none. */
export function makePreview(def: AnyVizDef): Preview | null {
  const spec = def.preview;
  if (!spec) return null;
  const ex = spec.example ? def.examples.find((e) => e.id === spec.example) : def.examples[0];
  if (!ex) throw new Error(`${def.id}: preview example "${spec.example}" not found`);
  const settings = normalizeSettings(def.settings, def.defaults, ex.settings);
  const tl = new Timeline(def, settings, ex.seed, ex.ops);
  const level = spec.level ?? 1;
  const steps = [];
  for (let i = 0; i < tl.length; i++) {
    const step = tl.at(i).step;
    if (step.level <= level) steps.push(step);
  }
  const frames = sample(steps, MAX_FRAMES)
    .map((step) => strip(def.view(step, settings).shapes, [...DEFAULT_HIDE, ...(spec.hide ?? [])]))
    // Keep the drawing on screen from the first frame: an empty start shows nothing.
    .filter((shapes, i, all) => shapes.length > 0 || i === all.length - 1);
  const boxes = frames.map((f) => shapesBounds(f, 0)).filter((b): b is Bounds => b !== null);
  if (boxes.length === 0) throw new Error(`${def.id}: preview draws nothing`);
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  const pad = Math.max(x2 - x1, y2 - y1) * 0.04;
  const bounds = {
    x: round(x1 - pad),
    y: round(y1 - pad),
    w: round(x2 - x1 + 2 * pad),
    h: round(y2 - y1 + 2 * pad),
  };
  let poster = 0;
  frames.forEach((f, i) => {
    if (f.length >= frames[poster]!.length) poster = i;
  });
  return { bounds, frames, poster };
}

/**
 * What the catalog loads up front: each page's still picture. The frames come only when a
 * thumbnail first plays (one file per page), so phones, which have no hover, never fetch them.
 */
export interface PreviewPoster {
  bounds: Bounds;
  shapes: Shape[];
}

export const posterOf = (p: Preview): PreviewPoster => ({
  bounds: p.bounds,
  shapes: p.frames[p.poster]!,
});

/** Previews of every page that asks for one, keyed by page id. */
export function makePreviews(defs: AnyVizDef[]): Record<string, Preview> {
  const out: Record<string, Preview> = {};
  for (const def of defs) {
    const p = makePreview(def);
    if (p) out[def.id] = p;
  }
  return out;
}

/** The still pictures of every page, keyed by page id: /previews.json. */
export function makePosters(defs: AnyVizDef[]): Record<string, PreviewPoster> {
  const out: Record<string, PreviewPoster> = {};
  for (const [id, p] of Object.entries(makePreviews(defs))) out[id] = posterOf(p);
  return out;
}
