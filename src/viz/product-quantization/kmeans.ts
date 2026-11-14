/**
 * k-means on vectors of any length, with the k-means page's rules (src/viz/k-means/model.ts),
 * so a codebook here is what that page would find on the same points:
 *
 *   seeding   k-means++: the first centre is the ⌊u·m⌋-th of the m points; each next one the
 *             first point whose running total of D² passes u·Σ D² (uniform among the points not
 *             chosen yet when every D² is 0)
 *   assign    nearest centre by squared distance, a tie to the lower index
 *   update    each centre to the mean of its points; a centre with no points jumps to the point
 *             farthest from its own centre (when that point is not on its centre already)
 *   stop      when an assignment changes nothing, or after 20 assignments
 */

export const MAX_ROUNDS = 20;

/** Squared distance, summed coordinate by coordinate from 0 (the code tabs do the same). */
export function dist2(a: readonly number[], b: readonly number[]): number {
  let t = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    t += d * d;
  }
  return t;
}

/** Index of the nearest centre; a tie goes to the lower index. */
export function nearest(p: readonly number[], centres: readonly (readonly number[])[]): number {
  let best = 0;
  for (let j = 1; j < centres.length; j++)
    if (dist2(p, centres[j]!) < dist2(p, centres[best]!)) best = j;
  return best;
}

/** The k-means++ picks (indices into points) for the draws us, one per centre. */
export function seedPlus(points: readonly (readonly number[])[], us: readonly number[]): number[] {
  const chosen: number[] = [];
  for (const u of us) {
    if (chosen.length > 0) {
      const dd = points.map((p) => Math.min(...chosen.map((j) => dist2(p, points[j]!))));
      let total = 0;
      const cum = dd.map((x) => (total += x));
      if (total > 0) {
        const target = u * total;
        chosen.push(cum.findIndex((c) => c > target));
        continue;
      }
    }
    const pool = points.map((_, i) => i).filter((i) => !chosen.includes(i));
    chosen.push(pool[Math.floor(u * pool.length)]!);
  }
  return chosen;
}

/** The mean of some vectors, summed in order and divided once. */
function mean(pts: readonly (readonly number[])[]): number[] {
  const s = pts[0]!.map(() => 0);
  for (const p of pts) p.forEach((x, i) => (s[i] = s[i]! + x));
  return s.map((x) => x / pts.length);
}

/** Each centre to the mean of its points; then the empty ones jump (see above). */
export function update(
  points: readonly (readonly number[])[],
  labels: readonly number[],
  centres: readonly (readonly number[])[],
): number[][] {
  const next = centres.map((c) => [...c]);
  const empty: number[] = [];
  centres.forEach((_, j) => {
    const mine = points.filter((_, i) => labels[i] === j);
    if (mine.length) next[j] = mean(mine);
    else empty.push(j);
  });
  const taken = new Set<number>();
  for (const j of empty) {
    let far = -1;
    let farD = 0;
    points.forEach((p, i) => {
      const d = dist2(p, next[labels[i]!]!);
      if (!taken.has(i) && d > farD) {
        far = i;
        farD = d;
      }
    });
    if (far >= 0) {
      taken.add(far);
      next[j] = [...points[far]!];
    }
  }
  return next;
}

export interface Round {
  /** The assignment of this round, and the centres after its update. */
  labels: number[];
  centres: number[][];
}

/** Lloyd's algorithm from the starting centres: every round, and how many assignments ran. */
export function lloyd(
  points: readonly (readonly number[])[],
  start: readonly (readonly number[])[],
): { centres: number[][]; rounds: number; history: Round[]; converged: boolean } {
  let centres = start.map((c) => [...c]);
  let labels: number[] | null = null;
  const history: Round[] = [];
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const next = points.map((p) => nearest(p, centres));
    if (labels && next.every((l, i) => l === labels![i]))
      return { centres, rounds: round, history, converged: true };
    labels = next;
    centres = update(points, labels, centres);
    history.push({ labels, centres: centres.map((c) => [...c]) });
  }
  return { centres, rounds: MAX_ROUNDS, history, converged: false };
}
