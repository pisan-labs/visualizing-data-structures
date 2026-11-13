/**
 * The loss functions the gradient-descent page walks on: two curves of one variable and three
 * surfaces of two. Gradients are written out in the same order as the code tabs' driver, so
 * all four agree to the last bit.
 */

export type SurfaceId = 'bowl' | 'wells' | 'round' | 'narrow' | 'valley';

export interface Surface {
  id: SurfaceId;
  dims: 1 | 2;
  /** The formula, as the page writes it. */
  text: string;
  /** The gradient's formula. */
  gradText: string;
  f(p: readonly number[]): number;
  grad(p: readonly number[]): number[];
  /** Where a run starts unless the learner says otherwise. */
  start: number[];
  /** What the plot shows: x (and y) in the world; for a curve, y is the range of f shown. */
  xr: [number, number];
  yr: [number, number];
  /** Where the lowest point is, for the marker. */
  min: number[];
  /** The loss chart's range. */
  loss: [number, number];
  /** Contour levels and the point at angle θ on a level (two variables only). */
  levels?: number[];
  contour?(c: number, theta: number): [number, number];
}

const sq = (x: number) => x * x;

export const SURFACES: Record<SurfaceId, Surface> = {
  bowl: {
    id: 'bowl',
    dims: 1,
    text: 'f(x) = x²',
    gradText: 'f′(x) = 2x',
    f: ([x = 0]) => x * x,
    grad: ([x = 0]) => [2 * x],
    start: [3],
    xr: [-4, 4],
    yr: [0, 16],
    min: [0],
    loss: [0, 10],
  },
  wells: {
    id: 'wells',
    dims: 1,
    text: 'f(x) = x⁴/4 − x² + 0.3x',
    gradText: 'f′(x) = x³ − 2x + 0.3',
    f: ([x = 0]) => (x * x * x * x) / 4 - x * x + 0.3 * x,
    grad: ([x = 0]) => [x * x * x - 2 * x + 0.3],
    start: [2.5],
    xr: [-2.5, 2.5],
    yr: [-2, 5],
    min: [-1.4826],
    loss: [-1.5, 5],
  },
  round: {
    id: 'round',
    dims: 2,
    text: 'f(x, y) = (x² + y²)/2',
    gradText: '∇f = (x, y)',
    f: ([x = 0, y = 0]) => (x * x + y * y) / 2,
    grad: ([x = 0, y = 0]) => [x, y],
    start: [-2.5, 2],
    xr: [-3, 3],
    yr: [-3, 3],
    min: [0, 0],
    loss: [0, 6],
    levels: [0.125, 0.5, 1.125, 2, 3.125, 4.5],
    contour: (c, t) => [Math.sqrt(2 * c) * Math.cos(t), Math.sqrt(2 * c) * Math.sin(t)],
  },
  narrow: {
    id: 'narrow',
    dims: 2,
    text: 'f(x, y) = (x² + 10y²)/2',
    gradText: '∇f = (x, 10y)',
    f: ([x = 0, y = 0]) => (x * x + 10 * y * y) / 2,
    grad: ([x = 0, y = 0]) => [x, 10 * y],
    start: [-3.5, 1],
    xr: [-4, 4],
    yr: [-1.5, 1.5],
    min: [0, 0],
    loss: [0, 12],
    levels: [0.1, 0.5, 1.5, 3, 5, 8],
    contour: (c, t) => [Math.sqrt(2 * c) * Math.cos(t), Math.sqrt((2 * c) / 10) * Math.sin(t)],
  },
  valley: {
    id: 'valley',
    dims: 2,
    text: 'f(x, y) = (1 − x)² + 5(y − x²)²',
    gradText: '∇f = (−2(1 − x) − 20x(y − x²), 10(y − x²))',
    f: ([x = 0, y = 0]) => sq(1 - x) + 5 * sq(y - x * x),
    grad: ([x = 0, y = 0]) => [-2 * (1 - x) - 20 * x * (y - x * x), 10 * (y - x * x)],
    start: [-1.5, 2],
    xr: [-2, 2],
    yr: [-1, 3],
    min: [1, 1],
    loss: [0, 8],
    levels: [0.05, 0.3, 1, 2.5, 5, 9],
    // x = 1 + √c cos θ makes (1 − x)² = c cos²θ, so 5(y − x²)² = c sin²θ.
    contour: (c, t) => {
      const x = 1 + Math.sqrt(c) * Math.cos(t);
      return [x, x * x + Math.sqrt(c / 5) * Math.sin(t)];
    },
  },
};

export const SURFACE_IDS = Object.keys(SURFACES) as SurfaceId[];

/** Outside this box a run counts as diverged: four times the plot's reach from its center. */
export function far(s: Surface, p: readonly number[]): boolean {
  const out = (v: number, [lo, hi]: [number, number]) => {
    const mid = (lo + hi) / 2;
    return Math.abs(v - mid) > 2 * (hi - lo);
  };
  return !p.every(Number.isFinite) || out(p[0]!, s.xr) || (s.dims === 2 && out(p[1]!, s.yr));
}
