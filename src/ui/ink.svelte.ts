/**
 * Present mode's pointer and pen. Ink is drawn in an overlay above the stage (InkLayer.svelte),
 * in the drawing's own units, so it stays on what it marks when the stage is resized. It is
 * never part of the scene or of a saved example, and it goes when the step changes unless
 * "Keep ink" is on.
 */

export type InkTool = 'off' | 'pointer' | 'pen';

/**
 * Ink colors that read on every theme's stage (white, near-black and black): each has a contrast
 * of at least 3.5 with all three, so the same four serve light, dark and high contrast.
 */
export const INK_COLORS = [
  { name: 'Red', value: '#e53935' },
  { name: 'Blue', value: '#1e88e5' },
  { name: 'Green', value: '#2e9d3a' },
  { name: 'Magenta', value: '#d63ad6' },
] as const;

export interface InkPoint {
  x: number;
  y: number;
}

export interface Stroke {
  color: string;
  points: InkPoint[];
}

/** An SVG path through a stroke's points; a single point (a tap) draws a dot. */
export function strokePath(points: readonly InkPoint[]): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  const [first, ...rest] = points;
  if (!first) return '';
  const head = `M${r(first.x)} ${r(first.y)}`;
  if (rest.length === 0) return `${head}h0.01`;
  return head + rest.map((p) => `L${r(p.x)} ${r(p.y)}`).join('');
}

export class Ink {
  tool = $state<InkTool>('off');
  color = $state<string>(INK_COLORS[0].value);
  /** Keep the ink when the step changes. */
  keep = $state(false);
  /** Finished strokes and the one being drawn, oldest first. Replaced, never mutated. */
  strokes = $state.raw<Stroke[]>([]);
  private drawing = false;

  /** Whether a tool is on, so the stage's pan and zoom stay still. */
  get busy(): boolean {
    return this.tool !== 'off';
  }

  /** Choose a tool; choosing the one already on turns it off (the keys toggle). */
  toggle(tool: Exclude<InkTool, 'off'>): void {
    this.tool = this.tool === tool ? 'off' : tool;
  }

  setTool(tool: InkTool): void {
    this.tool = tool;
  }

  /** Pick a color, which also takes up the pen. */
  pick(color: string): void {
    this.color = color;
    this.tool = 'pen';
  }

  begin(p: InkPoint): void {
    if (this.tool !== 'pen') return;
    this.drawing = true;
    this.strokes = [...this.strokes, { color: this.color, points: [p] }];
  }

  extend(points: readonly InkPoint[]): void {
    const last = this.strokes.at(-1);
    if (!this.drawing || !last || points.length === 0) return;
    this.strokes = [...this.strokes.slice(0, -1), { ...last, points: [...last.points, ...points] }];
  }

  end(): void {
    this.drawing = false;
  }

  undo(): void {
    this.drawing = false;
    this.strokes = this.strokes.slice(0, -1);
  }

  clear(): void {
    this.drawing = false;
    if (this.strokes.length) this.strokes = [];
  }

  /** The step changed: the ink goes, unless it is kept. */
  stepChanged(): void {
    if (!this.keep) this.clear();
  }

  /** Leaving Present mode: tool off and no ink. Color and "Keep ink" stay for next time. */
  reset(): void {
    this.tool = 'off';
    this.clear();
  }
}
