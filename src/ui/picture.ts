/**
 * "Save picture" in the browser: reads the stage's drawing as it is on screen, with every
 * element's computed style (so the current theme's colors), and saves it as SVG or PNG.
 * src/render/picture.ts writes the file.
 */
import { parseColor, pictureSvg, type PictureNode } from '../render/picture';
import type { Bounds } from '../render/scene';

/** Paint read from the computed style. Text-only ones are read for text only. */
const PAINT = [
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
] as const;
const TEXT_PAINT = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
] as const;

/** Values that are the SVG default, which the file leaves out. */
const DEFAULTS: Record<string, string> = {
  'fill-opacity': '1',
  'fill-rule': 'nonzero',
  stroke: 'none',
  'stroke-opacity': '1',
  'stroke-dasharray': 'none',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  opacity: '1',
  'font-style': 'normal',
  'text-anchor': 'start',
  'dominant-baseline': 'auto',
};

const GEOMETRY = [
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
] as const;

/** Elements that hold others and paint nothing themselves. */
const CONTAINERS = new Set(['defs', 'marker']);

let probe: CanvasRenderingContext2D | null | undefined;

/** A color in a form src/render/picture.ts reads; the canvas converts newer color spaces. */
function srgb(value: string): string {
  if (value === 'none' || value.startsWith('url(') || parseColor(value)) return value;
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return value;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${(a ?? 255) / 255})`;
}

function readNode(el: Element): PictureNode | null {
  const tag = el.tagName;
  const style = getComputedStyle(el);
  if (style.display === 'none') return null;
  const attrs: Record<string, string> = {};
  for (const name of GEOMETRY) {
    const v = el.getAttribute(name);
    if (v !== null) attrs[name] = v;
  }
  if (!CONTAINERS.has(tag)) {
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    const text = tag === 'text' || tag === 'tspan';
    for (const name of text ? [...PAINT, ...TEXT_PAINT] : PAINT) {
      const v = style.getPropertyValue(name).trim();
      if (!v || DEFAULTS[name] === v) continue;
      attrs[name] = name === 'fill' || name === 'stroke' ? srgb(v) : v;
    }
    if (attrs.stroke === undefined || attrs.stroke === 'none') delete attrs['stroke-width'];
  }
  const node: PictureNode = { tag, attrs };
  if (tag === 'text') node.text = el.textContent ?? '';
  else {
    const kids = [...el.children].map(readNode).filter((n): n is PictureNode => n !== null);
    if (kids.length) node.children = kids;
  }
  return node;
}

export interface Picture {
  svg: string;
  width: number;
  height: number;
}

/**
 * The drawing in `svg` as a stand-alone SVG file, framed on `bounds` (the whole step, whatever
 * the zoom) at the size it is drawn on screen.
 */
export function readPicture(svg: SVGSVGElement, bounds: Bounds, title: string): Picture {
  const box = svg.getBoundingClientRect();
  const s = Math.min(box.width / bounds.w, box.height / bounds.h);
  const scale = Number.isFinite(s) && s > 0 ? s : 1;
  const width = Math.max(1, Math.round(bounds.w * scale));
  const height = Math.max(1, Math.round(bounds.h * scale));
  const root = getComputedStyle(document.documentElement);
  // The stage's own background (a card), so the picture looks as it does on the page.
  const card = svg.parentElement ? getComputedStyle(svg.parentElement).backgroundColor : '';
  const background = srgb(card && parseColor(card)?.a ? card : root.getPropertyValue('--surface'));
  const nodes = [...svg.children].map(readNode).filter((n): n is PictureNode => n !== null);
  const vars: Record<string, string> = {};
  for (const name of ['--font', '--surface', '--text', '--text-2']) {
    vars[name] = root.getPropertyValue(name);
  }
  const text = pictureSvg(nodes, {
    bounds,
    width,
    height,
    background,
    font: getComputedStyle(svg).fontFamily || 'var(--font)',
    title,
    vars,
  });
  return { svg: text, width, height };
}

/** The picture as a PNG, `scale` times its size, drawn through a canvas. */
export async function pngOf(picture: Picture, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([picture.svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(picture.width * scale);
    canvas.height = Math.round(picture.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw a PNG.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((done, fail) =>
      canvas.toBlob((b) => (b ? done(b) : fail(new Error('No PNG'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Hands a file to the browser's downloads. Nothing leaves the device. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
