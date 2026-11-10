/**
 * "Save picture": a stand-alone SVG of a drawing. The browser side (src/ui/picture.ts) reads the
 * stage's elements and their computed styles into `PictureNode`s; this file turns them into a
 * file that needs nothing else: every color inline (no CSS variables, classes or style sheets),
 * the system font stack, a background, and no references outside the file.
 */
import type { Bounds } from './scene';

export interface PictureNode {
  tag: string;
  /** Geometry and presentation attributes (fill, stroke, font-size, ...). */
  attrs: Record<string, string>;
  /** A text element's text. */
  text?: string;
  children?: PictureNode[];
}

export interface PictureOptions {
  /** The part of the drawing to show, in scene units. */
  bounds: Bounds;
  /** Size of the picture in CSS pixels. */
  width: number;
  height: number;
  background: string;
  /** Font stack for text that names none. */
  font: string;
  /** A description for the file's <title>. */
  title?: string;
  /** Values for any `var(--name)` left in an attribute. */
  vars?: Record<string, string>;
}

/** The elements a drawing uses (src/ui/Shapes.svelte); anything else is left out. */
const TAGS = new Set([
  'g',
  'defs',
  'marker',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'tspan',
]);

/** Attributes kept. `class`, `style`, event handlers and links are not among them. */
const ATTRS = new Set([
  'id',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'd',
  'points',
  'transform',
  'viewBox',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'orient',
  'marker-start',
  'marker-mid',
  'marker-end',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'paint-order',
]);

const COLOR_ATTRS = new Set(['fill', 'stroke']);

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
};

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A number or percentage, as a fraction of `full`. */
function part(s: string, full: number): number {
  const v = parseFloat(s);
  return s.trim().endsWith('%') ? (v / 100) * full : v;
}

/** Splits at top-level commas, leaving commas inside brackets alone. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out;
}

/**
 * Reads a CSS color: hex, rgb()/rgba() in either syntax, color(srgb ...), color-mix(in srgb, ...),
 * transparent and a few names. Null for anything else.
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[s]) return parseColor(NAMED[s]);
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\((.*)\)$/.exec(s);
  if (m) {
    const [rgb, alpha] = m[1]!.includes('/') ? m[1]!.split('/') : [m[1]!, undefined];
    const xs = rgb!.split(/[\s,]+/).filter(Boolean);
    const a = alpha ?? xs[3];
    if (xs.length < 3) return null;
    return {
      r: part(xs[0]!, 255),
      g: part(xs[1]!, 255),
      b: part(xs[2]!, 255),
      a: a === undefined ? 1 : clamp01(part(a, 1)),
    };
  }
  m = /^color\(srgb\s+([^/)]+)(?:\/\s*([^)]+))?\)$/.exec(s);
  if (m) {
    const xs = m[1]!.trim().split(/\s+/);
    if (xs.length !== 3) return null;
    const [r, g, b] = xs.map((x) => part(x, 1) * 255) as [number, number, number];
    return { r, g, b, a: m[2] ? clamp01(part(m[2], 1)) : 1 };
  }
  m = /^color-mix\(\s*in\s+srgb\s*,(.*)\)$/.exec(s);
  if (m) {
    const sides = splitTop(m[1]!).map((side) => {
      const pm = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(side);
      return { color: parseColor(pm ? pm[1]! : side), p: pm ? Number(pm[2]) / 100 : null };
    });
    const [a, b] = sides;
    if (sides.length !== 2 || !a?.color || !b?.color) return null;
    const pa = a.p ?? (b.p === null ? 0.5 : 1 - b.p);
    const pb = b.p ?? 1 - pa;
    const mix = (x: number, y: number) => (x * pa + y * pb) / (pa + pb);
    return {
      r: mix(a.color.r, b.color.r),
      g: mix(a.color.g, b.color.g),
      b: mix(a.color.b, b.color.b),
      a: mix(a.color.a, b.color.a),
    };
  }
  return null;
}

const hex2 = (v: number) =>
  Math.round(Math.max(0, Math.min(255, v)))
    .toString(16)
    .padStart(2, '0');

/** `#rrggbb`, and the alpha apart (SVG 1.1 readers want opacity in its own attribute). */
export function hexColor(input: string): { hex: string; alpha: number } | null {
  const c = parseColor(input);
  return c ? { hex: `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`, alpha: c.a } : null;
}

/** Replaces `var(--name, fallback)` with the variable's value, however deeply nested. */
export function resolveVars(value: string, vars: Record<string, string>): string {
  let out = value;
  for (let i = 0; i < 10 && out.includes('var('); i++) {
    out = out.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g,
      (_, name: string, fallback?: string) => vars[name]?.trim() ?? fallback?.trim() ?? '',
    );
  }
  return out;
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "Segoe UI" as 'Segoe UI', so a font stack reads plainly inside an attribute. */
const singleQuotes = (v: string) => v.replace(/"/g, "'");

/** Strips CSS pixel units from computed lengths: "1.5px" is 1.5 units in the drawing. */
const unitless = (v: string) => v.replace(/(\d)px\b/g, '$1');

/**
 * The attributes as the file writes them: colors in hex with their alpha folded into the
 * opacity attributes, `var()` resolved, and anything that still cannot be read left out.
 */
function cleanAttrs(attrs: Record<string, string>, vars: Record<string, string>): string[] {
  const out = new Map<string, string>();
  const alpha: Record<string, number> = {};
  for (const [name, raw] of Object.entries(attrs)) {
    if (!ATTRS.has(name)) continue;
    let v = resolveVars(raw, vars).trim();
    if (v === '' || v.includes('var(')) continue;
    if (COLOR_ATTRS.has(name) && v !== 'none' && !v.startsWith('url(')) {
      const c = hexColor(v);
      if (!c) continue;
      if (c.alpha <= 0) v = 'none';
      else {
        v = c.hex;
        if (c.alpha < 1) alpha[name] = c.alpha;
      }
    }
    if (/^(stroke-width|font-size|stroke-dasharray|x|y|width|height|r|rx|ry)$/.test(name)) {
      v = unitless(v);
    }
    if (name === 'font-family') v = singleQuotes(v);
    out.set(name, v);
  }
  for (const [name, a] of Object.entries(alpha)) {
    const key = `${name}-opacity`;
    const base = Number(out.get(key) ?? 1);
    out.set(key, String(Math.round(base * a * 1000) / 1000));
  }
  return [...out].map(([k, v]) => `${k}="${escapeAttr(v)}"`);
}

/** Elements that only hold others: left out when nothing in them is kept. */
const HOLDERS = new Set(['g', 'defs', 'marker']);

/** The ids that arrows point to (`marker-end="url(#id)"`), so unused markers can go. */
function markersUsed(nodes: readonly PictureNode[], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    for (const k of ['marker-start', 'marker-mid', 'marker-end']) {
      const m = /url\(\s*["']?#([^"')\s]+)["']?\s*\)/.exec(n.attrs[k] ?? '');
      if (m) into.add(m[1]!);
    }
    if (n.children) markersUsed(n.children, into);
  }
  return into;
}

interface WriteContext {
  vars: Record<string, string>;
  markers: Set<string>;
}

function writeNode(node: PictureNode, cx: WriteContext, depth: number): string {
  if (!TAGS.has(node.tag)) return '';
  if (node.tag === 'marker' && !cx.markers.has(node.attrs.id ?? '')) return '';
  const pad = '  '.repeat(depth);
  const attrs = cleanAttrs(node.attrs, cx.vars);
  const open = [node.tag, ...attrs].join(' ');
  const kids = (node.children ?? []).map((c) => writeNode(c, cx, depth + 1)).filter(Boolean);
  if (node.text !== undefined && node.text !== '') {
    return `${pad}<${open}>${escapeText(node.text)}</${node.tag}>`;
  }
  if (kids.length === 0) return HOLDERS.has(node.tag) ? '' : `${pad}<${open}/>`;
  return `${pad}<${open}>\n${kids.join('\n')}\n${pad}</${node.tag}>`;
}

/** The SVG file for a drawing. */
export function pictureSvg(nodes: readonly PictureNode[], opts: PictureOptions): string {
  const vars = opts.vars ?? {};
  const cx: WriteContext = { vars, markers: markersUsed(nodes) };
  const b = opts.bounds;
  const num = (v: number) => String(Math.round(v * 100) / 100);
  const bg = hexColor(resolveVars(opts.background, vars));
  const font = singleQuotes(resolveVars(opts.font, vars).trim());
  const head = [
    'svg',
    'xmlns="http://www.w3.org/2000/svg"',
    `width="${num(opts.width)}"`,
    `height="${num(opts.height)}"`,
    `viewBox="${[b.x, b.y, b.w, b.h].map(num).join(' ')}"`,
    ...(font && !font.includes('var(') ? [`font-family="${escapeAttr(font)}"`] : []),
  ].join(' ');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${head}>`,
    ...(opts.title ? [`  <title>${escapeText(opts.title)}</title>`] : []),
    `  <rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${
      bg && bg.alpha > 0 ? bg.hex : '#ffffff'
    }"/>`,
    ...nodes.map((n) => writeNode(n, cx, 1)).filter(Boolean),
    '</svg>',
    '',
  ];
  return lines.join('\n');
}

/** The file name for a saved picture: `<viz-id>-step-<n>.svg`. */
export function pictureName(vizId: string, step: number, ext: 'svg' | 'png'): string {
  return `${vizId}-step-${step}.${ext}`;
}
