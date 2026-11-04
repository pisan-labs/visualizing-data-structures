/**
 * Graph text: one line in any of three formats, read into a Graph and written back out.
 *
 *   edge list       A-B, B-C:4, C>D, E      "-" undirected, ">" (or "->") directed, ":w" a weight,
 *                                           a lone name is a vertex with no edges. Items are
 *                                           separated by commas, semicolons or spaces.
 *   adjacency list  A: B C; B: C:4; D:       each vertex, a colon, then its out-neighbours
 *                                           (":w" after a neighbour gives a weight). Entries are
 *                                           separated by semicolons.
 *   matrix          0 1 1; 1 0 0; 1 0 0      rows separated by semicolons; 0 means no edge and
 *                                           any other whole number is an edge of that weight.
 *                                           The vertices are A, B, C, ... in row order.
 *
 * Direction and weights come from the text:
 * - An edge list is directed when any edge uses ">". In a directed graph, A-B means both A>B
 *   and B>A.
 * - An adjacency list or matrix is undirected when it is symmetric (every A: B has a B: A with
 *   the same weight), and directed otherwise. So list an undirected edge from both ends.
 * - A graph is weighted when any edge has a weight; the others get weight 1.
 *
 * API
 *   readGraph(text)  -> { graph, format } or an Error whose message names the bad token
 *   parseGraph(text) -> Graph or Error
 *   formatGraph(graph, format = 'edges') -> text. parseGraph(formatGraph(g)) equals g for every
 *     graph with at least one edge. (A graph without edges reads back undirected and
 *     unweighted: there is nothing left to say otherwise.) The adjacency and matrix formats
 *     round-trip too, except that a directed graph whose arcs all come in equal pairs reads
 *     back undirected, and a matrix renames the vertices A, B, C...
 *   parseVertex(text) -> a vertex name or Error
 *   parseEdge(text)   -> { u, v, directed, w } for one edge such as A-B, A>B or A-B:4, or Error
 *   detectFormat(text) -> which of the three formats the text is read as
 */
import {
  MAX_EDGES,
  MAX_NAME,
  MAX_VERTICES,
  MAX_WEIGHT,
  MIN_WEIGHT,
  NAME,
  adjacency,
  compareNames,
  degree,
  letters,
  makeGraph,
  type Edge,
  type Graph,
} from './graph';

export type GraphFormat = 'edges' | 'adjacency' | 'matrix';

export const FORMAT_NAMES: Record<GraphFormat, string> = {
  edges: 'an edge list',
  adjacency: 'an adjacency list',
  matrix: 'an adjacency matrix',
};

const EXAMPLE = 'Write edges as A-B, A>B or A-B:4';
const WEIGHTS = `Weights are whole numbers from ${MIN_WEIGHT} to ${MAX_WEIGHT}`;

const fail = (message: string) => new Error(message);
const quote = (s: string) => `"${s.trim()}"`;
const isNameChar = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c);

/** A name that is too long or uses other characters, or null when it is fine. */
function nameProblem(name: string): string | null {
  if (NAME.test(name)) return null;
  if (/^[A-Za-z0-9_]+$/.test(name))
    return `${quote(name)} is too long. Vertex names have 1 to ${MAX_NAME} letters or digits, such as A or v10.`;
  return `${quote(name)} is not a vertex name. Use 1 to ${MAX_NAME} letters or digits, such as A or v10.`;
}

function weightOf(raw: string, token: string): number | Error {
  if (!/^-?\d+$/.test(raw)) return fail(`${quote(token)}: ${WEIGHTS}.`);
  const w = Number(raw);
  if (w < MIN_WEIGHT || w > MAX_WEIGHT) return fail(`${quote(token)}: ${WEIGHTS}.`);
  return w;
}

function checkSize(g: Graph): Graph | Error {
  if (g.vertices.length > MAX_VERTICES)
    return fail(
      `That is ${g.vertices.length} vertices. Keep it to ${MAX_VERTICES} so the drawing stays readable.`,
    );
  if (g.edges.length > MAX_EDGES)
    return fail(
      `That is ${g.edges.length} edges. Keep it to ${MAX_EDGES} so the drawing stays readable.`,
    );
  return g;
}

// ---------------------------------------------------------------------------------------------
// Format detection

export function detectFormat(text: string): GraphFormat {
  const t = text.trim();
  const first = (t.split(';')[0] ?? '').trim();
  const tokens = first.split(/[\s,]+/).filter(Boolean);
  if (t.includes(';') && tokens.length > 0 && tokens.every((x) => /^-?\d+$/.test(x)))
    return 'matrix';
  if (/^[A-Za-z0-9_]+\s*:/.test(first)) return 'adjacency';
  return 'edges';
}

// ---------------------------------------------------------------------------------------------
// Edge list

interface Item {
  u: string;
  v?: string;
  op?: '-' | '>';
  w?: number;
  /** The item as typed, for messages. */
  text: string;
}

/** Read edge-list items: A, A-B, A>B, A->B, each with an optional :w. */
function scanItems(text: string): Item[] | Error {
  const items: Item[] = [];
  const n = text.length;
  let i = 0;
  const skip = () => {
    while (i < n && /\s/.test(text[i]!)) i++;
  };
  const name = () => {
    const s = i;
    while (i < n && isNameChar(text[i])) i++;
    return text.slice(s, i);
  };
  // The raw item that starts at s, up to the next comma or semicolon, for error messages.
  const raw = (s: number) => {
    let e = s;
    while (e < n && text[e] !== ',' && text[e] !== ';') e++;
    return text.slice(s, e);
  };
  for (;;) {
    skip();
    if (i >= n) break;
    if (text[i] === ',' || text[i] === ';') {
      i++;
      continue;
    }
    const start = i;
    if (!isNameChar(text[i]))
      return fail(`${quote(raw(start))}: "${text[i]}" cannot start a vertex name. ${EXAMPLE}.`);
    const u = name();
    const bad = nameProblem(u);
    if (bad) return fail(bad);
    skip();
    const item: Item = { u, text: '' };
    let op: '-' | '>' | undefined;
    if (text[i] === '-' && text[i + 1] === '>') {
      op = '>';
      i += 2;
    } else if (text[i] === '-' || text[i] === '>') {
      op = text[i] as '-' | '>';
      i++;
    }
    if (op) {
      const shown = text.slice(start, i).replace(/\s+/g, '');
      skip();
      if (!isNameChar(text[i])) {
        const what = op === '>' ? '>' : '-';
        return fail(
          i >= n || text[i] === ',' || text[i] === ';'
            ? `${quote(shown)} needs a vertex after "${what}". ${EXAMPLE}.`
            : `${quote(raw(start))}: "${text[i]}" cannot start a vertex name. ${EXAMPLE}.`,
        );
      }
      const v = name();
      const badV = nameProblem(v);
      if (badV) return fail(badV);
      item.op = op;
      item.v = v;
      skip();
    }
    if (text[i] === ':') {
      i++;
      skip();
      const s = i;
      if (text[i] === '-' || text[i] === '+') i++;
      while (i < n && /[0-9A-Za-z_.]/.test(text[i]!)) i++;
      const w = text.slice(s, i);
      const typed = raw(start).trim();
      if (!item.op) return fail(`${quote(typed)}: a weight goes on an edge, such as A-B:4.`);
      if (!w) return fail(`${quote(typed)} needs a weight after ":", such as A-B:4.`);
      const weight = weightOf(w.replace(/^\+/, ''), typed);
      if (weight instanceof Error) return weight;
      item.w = weight;
      skip();
    }
    item.text = text.slice(start, i).trim();
    if (i < n && !isNameChar(text[i]) && text[i] !== ',' && text[i] !== ';') {
      if (text[i] === '<' && !item.op)
        return fail(`${quote(raw(start))}: write an edge from B to A as B>A.`);
      return fail(`${quote(raw(start))}: "${text[i]}" cannot be part of a graph here. ${EXAMPLE}.`);
    }
    items.push(item);
  }
  return items;
}

function edgeListGraph(text: string): Graph | Error {
  const items = scanItems(text);
  if (items instanceof Error) return items;
  if (items.length === 0) return fail(`Type a graph first, such as A-B, B-C, C-A.`);
  const directed = items.some((it) => it.op === '>');
  const weighted = items.some((it) => it.w !== undefined);
  const vertices = new Set<string>();
  // Arcs (directed) or pairs (undirected) seen so far, with the item that made them.
  const seen = new Map<string, Item>();
  const edges: Edge[] = [];
  const add = (u: string, v: string, w: number, it: Item): Error | null => {
    const key = directed ? `${u}>${v}` : compareNames(u, v) < 0 ? `${u}-${v}` : `${v}-${u}`;
    const before = seen.get(key);
    if (before) {
      if (before.text === it.text) return fail(`${quote(it.text)} appears twice.`);
      if (directed && before.op !== it.op) {
        const both = before.op === '-' ? before : it;
        return fail(
          `${quote(before.op === '-' ? it.text : before.text)} repeats part of ${both.text}, which already goes both ways.`,
        );
      }
      return fail(`${quote(it.text)} repeats ${before.text}.`);
    }
    seen.set(key, it);
    edges.push({ u, v, w });
    return null;
  };
  for (const it of items) {
    vertices.add(it.u);
    if (!it.v) continue;
    vertices.add(it.v);
    if (it.u === it.v)
      return fail(`${quote(it.text)} is a loop. An edge joins two different vertices.`);
    const w = it.w ?? 1;
    const err =
      add(it.u, it.v, w, it) ?? (directed && it.op === '-' ? add(it.v, it.u, w, it) : null);
    if (err) return err;
  }
  return checkSize(makeGraph({ directed, weighted, vertices, edges }));
}

// ---------------------------------------------------------------------------------------------
// Adjacency list and matrix

/** Arcs u -> v with weights; undirected when every arc has a partner with the same weight. */
function fromArcs(vertices: string[], arcs: Edge[], weighted: boolean): Graph | Error {
  const w = new Map(arcs.map((a) => [`${a.u}>${a.v}`, a.w]));
  const symmetric = arcs.every((a) => w.get(`${a.v}>${a.u}`) === a.w);
  const edges = symmetric ? arcs.filter((a) => compareNames(a.u, a.v) < 0) : arcs;
  return checkSize(makeGraph({ directed: !symmetric, weighted, vertices, edges }));
}

function adjacencyGraph(text: string): Graph | Error {
  const entries = text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const heads = new Map<string, string>();
  const vertices: string[] = [];
  const arcs: Edge[] = [];
  let weighted = false;
  for (const entry of entries) {
    const m = /^([^:]*?)\s*:(.*)$/.exec(entry);
    if (!m) return fail(`${quote(entry)} needs a colon after its vertex, as in A: B C.`);
    const head = m[1]!.trim();
    if (!head) return fail(`${quote(entry)} needs a vertex before the colon, as in A: B C.`);
    if (!/^[A-Za-z0-9_]+$/.test(head))
      return fail(`${quote(entry)} should start with one vertex and a colon, as in A: B C.`);
    const bad = nameProblem(head);
    if (bad) return fail(bad);
    if (heads.has(head))
      return fail(
        `${head} has two lists, ${quote(heads.get(head)!)} and ${quote(entry)}. Give each vertex one list.`,
      );
    heads.set(head, entry);
    vertices.push(head);
    const listed = new Set<string>();
    for (const token of m[2]!.split(/[\s,]+/).filter(Boolean)) {
      const t = /^([A-Za-z0-9_]+)(?::(.*))?$/.exec(token);
      if (!t)
        return fail(
          `In ${quote(entry)}, ${quote(token)} is not a vertex. List neighbours as B C, or B:4 C:2 with weights.`,
        );
      const v = t[1]!;
      const badV = nameProblem(v);
      if (badV) return fail(badV);
      if (v === head)
        return fail(`${quote(entry)} has a loop: ${head} cannot be its own neighbour.`);
      if (listed.has(v)) return fail(`${quote(entry)} lists ${v} twice.`);
      listed.add(v);
      let w = 1;
      if (t[2] !== undefined) {
        if (t[2] === '') return fail(`${quote(token)} needs a weight after ":", such as B:4.`);
        const parsed = weightOf(t[2], token);
        if (parsed instanceof Error) return parsed;
        w = parsed;
        weighted = true;
      }
      vertices.push(v);
      arcs.push({ u: head, v, w });
    }
  }
  return fromArcs(vertices, arcs, weighted);
}

function matrixGraph(text: string): Graph | Error {
  const rows = text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/[\s,]+/).filter(Boolean));
  const n = rows.length;
  if (n > MAX_VERTICES)
    return fail(
      `That is ${n} rows. Keep the matrix to ${MAX_VERTICES} vertices so it stays readable.`,
    );
  const names = letters(n);
  const arcs: Edge[] = [];
  let weighted = false;
  for (let i = 0; i < n; i++) {
    const row = rows[i]!;
    const bad = row.find((x) => !/^-?\d+$/.test(x));
    if (bad !== undefined)
      return fail(
        `Row ${i + 1} has ${quote(bad)}. Matrix entries are whole numbers, and 0 means no edge.`,
      );
    if (row.length !== n)
      return fail(
        `Row ${i + 1} has ${row.length} ${row.length === 1 ? 'entry' : 'entries'}, but there ${n === 1 ? 'is 1 row' : `are ${n} rows`}. Each row needs one entry per vertex.`,
      );
    for (let j = 0; j < n; j++) {
      const x = Number(row[j]);
      if (x === 0) continue;
      const u = names[i]!;
      const v = names[j]!;
      if (i === j)
        return fail(
          `Row ${i + 1}, column ${j + 1} is ${row[j]}: ${u} cannot have an edge to itself. Put 0 on the diagonal.`,
        );
      const w = weightOf(row[j]!, `row ${i + 1}, column ${j + 1}: ${row[j]}`);
      if (w instanceof Error) return w;
      if (w !== 1) weighted = true;
      arcs.push({ u, v, w });
    }
  }
  return fromArcs(names, arcs, weighted);
}

// ---------------------------------------------------------------------------------------------
// Reading

export function readGraph(raw: string): { graph: Graph; format: GraphFormat } | Error {
  const text = String(raw ?? '');
  if (!text.trim()) return fail('Type a graph first, such as A-B, B-C, C-A.');
  const format = detectFormat(text);
  const graph =
    format === 'matrix'
      ? matrixGraph(text)
      : format === 'adjacency'
        ? adjacencyGraph(text)
        : edgeListGraph(text);
  return graph instanceof Error ? graph : { graph, format };
}

export function parseGraph(text: string): Graph | Error {
  const r = readGraph(text);
  return r instanceof Error ? r : r.graph;
}

/** One vertex name, such as a start vertex. */
export function parseVertex(raw: string): string | Error {
  const t = String(raw ?? '').trim();
  if (!t) return fail('Type a vertex name, such as A.');
  const bad = nameProblem(t);
  return bad ? fail(bad) : t;
}

export interface EdgeInput {
  u: string;
  v: string;
  /** Typed with ">" (one way) rather than "-". */
  directed: boolean;
  /** The weight typed after ":", or null. */
  w: number | null;
}

/** One edge: A-B, A>B, A->B, each with an optional :w. */
export function parseEdge(raw: string): EdgeInput | Error {
  const t = String(raw ?? '').trim();
  if (!t) return fail('Type an edge, such as A-B or A>B.');
  const items = scanItems(t);
  if (items instanceof Error) return items;
  if (items.length !== 1 || !items[0]!.v)
    return fail(`${quote(t)} is not one edge. Type an edge such as A-B, A>B or A-B:4.`);
  const it = items[0]!;
  if (it.u === it.v)
    return fail(`${quote(it.text)} is a loop. An edge joins two different vertices.`);
  return { u: it.u, v: it.v!, directed: it.op === '>', w: it.w ?? null };
}

// ---------------------------------------------------------------------------------------------
// Writing

const weightText = (g: Graph, w: number) => (g.weighted ? `:${w}` : '');

export function formatGraph(g: Graph, format: GraphFormat = 'edges'): string {
  if (format === 'adjacency') {
    const adj = adjacency(g);
    return g.vertices
      .map((v) => {
        const list = (adj.get(v) ?? []).map((a) => `${a.v}${weightText(g, a.w)}`);
        return list.length ? `${v}: ${list.join(' ')}` : `${v}:`;
      })
      .join('; ');
  }
  if (format === 'matrix') {
    const index = new Map(g.vertices.map((v, i) => [v, i]));
    const m = g.vertices.map(() => g.vertices.map(() => 0));
    for (const e of g.edges) {
      m[index.get(e.u)!]![index.get(e.v)!] = e.w;
      if (!g.directed) m[index.get(e.v)!]![index.get(e.u)!] = e.w;
    }
    return m.map((row) => row.join(' ')).join('; ');
  }
  const items: string[] = [];
  if (!g.directed) {
    for (const e of g.edges) items.push(`${e.u}-${e.v}${weightText(g, e.w)}`);
  } else {
    // Arcs both ways with the same weight read as one A-B, but only while some arc stays one
    // way: if every arc were paired, A-B everywhere would read back undirected.
    const w = new Map(g.edges.map((e) => [`${e.u}>${e.v}`, e.w]));
    const paired = (e: Edge) => w.get(`${e.v}>${e.u}`) === e.w;
    const pairUp = g.edges.some((e) => !paired(e));
    for (const e of g.edges) {
      if (pairUp && paired(e)) {
        if (compareNames(e.u, e.v) < 0) items.push(`${e.u}-${e.v}${weightText(g, e.w)}`);
      } else {
        items.push(`${e.u}>${e.v}${weightText(g, e.w)}`);
      }
    }
  }
  for (const v of g.vertices) if (degree(g, v) === 0) items.push(v);
  return items.join(', ');
}
