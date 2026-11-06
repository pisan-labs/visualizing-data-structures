/**
 * Cities for the traveling salesperson page: a complete undirected graph whose weights are
 * distances, plus (when the cities came as points) where each city is.
 *
 * Input is one line in either form:
 *   points      A(0,0) B(30,40) C(60,0)   a name and whole-number coordinates from -99 to 99.
 *                                         The distance between two cities is their straight-line
 *                                         distance rounded up, so the triangle inequality still
 *                                         holds (rounding to the nearest can break it).
 *   graph text  A-B:5, A-C:4, B-C:3       any graph format of ../_graph/parse.ts, as long as it
 *                                         is undirected, complete (every pair has a weight) and
 *                                         has no negative weight.
 * At most MAX_CITIES cities, so the exact method stays small.
 *
 * API
 *   readCities(text)  -> { graph, pts } or an Error that says what is wrong
 *   citiesText(pts)   -> the points form, for presets and examples
 *   distance(a, b)    -> the rounded-up distance between two points
 *   distances(g)      -> d(u, v), cached per graph
 *   triangleBreak(g)  -> a triple that breaks the triangle inequality, or null
 *   tourCost(g, tour) -> the length of a closed tour
 */
import { compareNames, findEdge, makeGraph, NAME, type Edge, type Graph } from '../_graph/graph';
import { readGraph } from '../_graph/parse';

export const MAX_CITIES = 8;
export const MAX_COORD = 99;

export interface Pt {
  x: number;
  y: number;
}

export type Points = Record<string, Pt>;

export const distance = (a: Pt, b: Pt): number => Math.ceil(Math.hypot(a.x - b.x, a.y - b.y));

const CITY = /([A-Za-z0-9_]+)\s*\(\s*([^,()]*?)\s*,\s*([^,()]*?)\s*\)/g;

function fromPoints(text: string): { graph: Graph; pts: Points } | Error {
  const pts: Points = {};
  const leftover = text.replace(CITY, ' ').replace(/[\s,;]+/g, '');
  if (leftover) {
    const bad = text
      .replace(CITY, ' ')
      .split(/[\s,;]+/)
      .find((t) => t);
    return new Error(
      `"${bad ?? leftover}" is not a city. Write each city as a name and its coordinates, such as A(0,0) B(30,40).`,
    );
  }
  for (const m of text.matchAll(CITY)) {
    const [whole, name, xs, ys] = m as unknown as [string, string, string, string];
    if (!NAME.test(name))
      return new Error(`"${name}" is not a city name. Use 1 to 3 letters or digits, such as A.`);
    const coords = [xs, ys].map((c) => (/^-?\d+$/.test(c) ? Number(c) : NaN));
    if (coords.some((c) => !Number.isFinite(c) || Math.abs(c) > MAX_COORD))
      return new Error(
        `"${whole}": coordinates are whole numbers from -${MAX_COORD} to ${MAX_COORD}.`,
      );
    if (pts[name]) return new Error(`City ${name} appears twice. Give each city one place.`);
    pts[name] = { x: coords[0]!, y: coords[1]! };
  }
  const names = Object.keys(pts).sort(compareNames);
  if (names.length === 0) return new Error('Type cities such as A(0,0) B(30,40) C(60,0).');
  if (names.length > MAX_CITIES)
    return new Error(
      `That is ${names.length} cities. This page takes at most ${MAX_CITIES}, so the exact method stays small enough to watch.`,
    );
  const edges: Edge[] = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++)
      edges.push({ u: names[i]!, v: names[j]!, w: distance(pts[names[i]!]!, pts[names[j]!]!) });
  return { graph: makeGraph({ directed: false, weighted: true, vertices: names, edges }), pts };
}

function fromGraph(text: string): { graph: Graph; pts: null } | Error {
  const r = readGraph(text);
  if (r instanceof Error) return r;
  const g = r.graph;
  if (g.directed)
    return new Error(
      'This page needs an undirected graph: the distance from A to B is the distance from B to A. Write edges with -, such as A-B:5.',
    );
  if (g.vertices.length > MAX_CITIES)
    return new Error(
      `That is ${g.vertices.length} cities. This page takes at most ${MAX_CITIES}, so the exact method stays small enough to watch.`,
    );
  const neg = g.edges.find((e) => e.w < 0);
  if (neg)
    return new Error(
      `${neg.u}-${neg.v} has weight ${neg.w}. A distance cannot be negative: use 0 or more.`,
    );
  for (let i = 0; i < g.vertices.length; i++)
    for (let j = i + 1; j < g.vertices.length; j++) {
      const u = g.vertices[i]!;
      const v = g.vertices[j]!;
      if (!findEdge(g, u, v))
        return new Error(
          `${u}-${v} is missing. A tour may go from any city to any other, so every pair needs a distance (a complete graph), or type cities as points, such as A(0,0) B(30,40).`,
        );
    }
  return { graph: makeGraph({ ...g, weighted: true }), pts: null };
}

export function readCities(raw: string): { graph: Graph; pts: Points | null } | Error {
  const text = raw.trim();
  if (!text) return new Error('Type cities such as A(0,0) B(30,40) C(60,0), or a complete graph.');
  return text.includes('(') ? fromPoints(text) : fromGraph(text);
}

export function citiesText(pts: Points): string {
  return Object.keys(pts)
    .sort(compareNames)
    .map((n) => `${n}(${pts[n]!.x},${pts[n]!.y})`)
    .join(' ');
}

const cache = new WeakMap<Graph, (u: string, v: string) => number>();

/** d(u, v) for a complete graph (0 from a city to itself). */
export function distances(g: Graph): (u: string, v: string) => number {
  let d = cache.get(g);
  if (d) return d;
  const m = new Map<string, number>();
  for (const e of g.edges) {
    m.set(`${e.u}|${e.v}`, e.w);
    m.set(`${e.v}|${e.u}`, e.w);
  }
  d = (u, v) => (u === v ? 0 : (m.get(`${u}|${v}`) ?? Infinity));
  cache.set(g, d);
  return d;
}

export function triangleBreak(g: Graph): [string, string, string] | null {
  const d = distances(g);
  const vs = g.vertices;
  for (const a of vs)
    for (const b of vs)
      for (const c of vs)
        if (a !== b && b !== c && a !== c && d(a, c) > d(a, b) + d(b, c)) return [a, b, c];
  return null;
}

export function tourCost(g: Graph, tour: string[]): number {
  if (tour.length < 2) return 0;
  const d = distances(g);
  let total = 0;
  for (let i = 0; i < tour.length; i++) total += d(tour[i]!, tour[(i + 1) % tour.length]!);
  return total;
}
