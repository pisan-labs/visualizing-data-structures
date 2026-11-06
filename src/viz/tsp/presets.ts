/**
 * Cities for presets, practice and tests. Points have whole coordinates from 0 to 90.
 *
 *   randomCities(rng, n)    n cities on a 10 x 10 grid of spots, no two on one spot
 *   circleCities(n)         n cities on a circle: the best tour goes round it
 *   clusterCities(rng, n)   two tight clusters far apart
 *   lineCities(n)           cities on a line at growing gaps, in a zig-zag order
 *   NN_TRAP, TREE_TRAP      the worst instances a search over 4000 random ones found
 *   NOT_METRIC              distances that break the triangle inequality
 *   tspPresets()            the page's presets
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, Preset } from '../../engine/types';
import { letters } from '../_graph/graph';
import { citiesText, MAX_CITIES, type Points } from './cities';

const clamp = (n: number) => Math.max(3, Math.min(MAX_CITIES, Math.round(n)));

export function randomCities(rng: Rng, n: number): Points {
  const pts: Points = {};
  const used = new Set<string>();
  for (const name of letters(clamp(n))) {
    for (;;) {
      const x = rng.int(0, 9) * 10;
      const y = rng.int(0, 9) * 10;
      if (used.has(`${x},${y}`)) continue;
      used.add(`${x},${y}`);
      pts[name] = { x, y };
      break;
    }
  }
  return pts;
}

export function circleCities(n: number): Points {
  const m = clamp(n);
  const pts: Points = {};
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  // Names jump around the circle, so the name order does not give the tour away.
  const jump = [2, 3, 5, 7].find((s) => s < m && gcd(s, m) === 1) ?? 1;
  letters(m).forEach((name, i) => {
    const a = (2 * Math.PI * ((i * jump) % m)) / m;
    pts[name] = { x: Math.round(45 + 45 * Math.sin(a)), y: Math.round(45 + 45 * Math.cos(a)) };
  });
  return pts;
}

export function clusterCities(rng: Rng, n: number): Points {
  const m = clamp(n);
  const pts: Points = {};
  const used = new Set<string>();
  letters(m).forEach((name, i) => {
    const [cx, cy] = i % 2 === 0 ? [10, 10] : [80, 70];
    for (;;) {
      const x = cx + rng.int(0, 2) * 5;
      const y = cy + rng.int(0, 2) * 5;
      if (used.has(`${x},${y}`)) continue;
      used.add(`${x},${y}`);
      pts[name] = { x, y };
      break;
    }
  });
  return pts;
}

export function lineCities(n: number): Points {
  const m = clamp(n);
  const xs = [45, 50, 38, 62, 25, 80, 5, 99];
  const pts: Points = {};
  letters(m).forEach((name, i) => (pts[name] = { x: xs[i]!, y: 50 }));
  return pts;
}

export const NN_TRAP = 'A(0,60) B(20,40) C(40,60) D(70,40) E(30,40) F(10,30) G(20,80)';
export const TREE_TRAP = 'A(60,10) B(60,60) C(40,60) D(0,50) E(50,80) F(90,40) G(30,20)';
export const NOT_METRIC = 'A-B:60, A-C:1, A-D:1, A-E:3, B-C:2, B-D:1, B-E:3, C-D:2, C-E:1, D-E:57';

export const loadCities = (pts: Points): OpCall => ['load', citiesText(pts)];

export function tspPresets(): Preset[] {
  const p = (label: string, make: (rng: Rng, n: number) => OpCall): Preset => ({
    label,
    make: (rng, n) => [make(rng, n), ['run']],
  });
  return [
    p('Random cities', (rng, n) => loadCities(randomCities(rng, n))),
    p('Cities on a circle (every method can win)', (_rng, n) => loadCities(circleCities(n))),
    p('Two clusters far apart', (rng, n) => loadCities(clusterCities(rng, n))),
    p('Cities on a line', (_rng, n) => loadCities(lineCities(n))),
    p('Bad case for nearest neighbour', () => ['load', NN_TRAP]),
    p('Bad case for the tree walk', () => ['load', TREE_TRAP]),
    p('No triangle inequality (no guarantee)', () => ['load', NOT_METRIC]),
  ];
}
