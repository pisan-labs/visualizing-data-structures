import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../engine/timeline';
import type { AnyVizDef } from '../engine/types';
import { vizzes } from '../viz/all';
import {
  hexColor,
  parseColor,
  pictureName,
  pictureSvg,
  resolveVars,
  type PictureNode,
} from './picture';
import type { Scene, Shape } from './scene';
import { LAPTOP_STAGE } from './stage';

/** The design tokens of one theme, read from src/app.css as the browser would. */
function themeVars(theme: 'light' | 'dark' | 'contrast'): Record<string, string> {
  const css = fs.readFileSync('src/app.css', 'utf8');
  const selector = {
    light: ':root {',
    dark: ":root[data-theme='dark'] {",
    contrast: ":root[data-theme='contrast'] {",
  }[theme];
  const read = (block: string) =>
    Object.fromEntries(
      [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
    );
  const block = (sel: string) => {
    const start = css.indexOf(sel);
    return css.slice(start, css.indexOf('\n}', start));
  };
  // Every theme starts from the light tokens and overrides some.
  return { ...read(block(':root {')), ...read(block(selector)) };
}

/**
 * A stage drawing as the browser layer hands it over: the tags src/ui/Shapes.svelte writes, with
 * the paint its style sheet gives them still as CSS variables and color-mix(), as an inline style
 * or a theme would leave them. The browser resolves these itself; the file must too.
 */
function drawing(scene: Scene): PictureNode[] {
  const marker: PictureNode = {
    tag: 'marker',
    attrs: { id: 'arrow-1-base', viewBox: '0 0 10 10', refX: '9', refY: '5', orient: 'auto' },
    children: [{ tag: 'path', attrs: { d: 'M0 0L10 5L0 10z', fill: 'var(--text-2)' } }],
  };
  const role = (s: Shape) =>
    s.role && s.role.startsWith('g')
      ? `var(--c-${s.role})`
      : s.role
        ? `var(--c-${s.role}, var(--text-2))`
        : null;
  const node = (s: Shape): PictureNode => {
    const accent = role(s);
    switch (s.kind) {
      case 'rect':
        return {
          tag: 'rect',
          attrs: {
            x: String(s.x),
            y: String(s.y),
            width: String(s.w),
            height: String(s.h),
            fill: accent
              ? `color-mix(in srgb, ${accent} 14%, var(--cell-live))`
              : 'var(--cell-empty)',
            stroke: accent ?? 'var(--line-strong)',
            'stroke-width': '1.5px',
          },
        };
      case 'circle':
        return {
          tag: 'circle',
          attrs: {
            cx: String(s.x),
            cy: String(s.y),
            r: String(s.r),
            fill: 'var(--cell-live)',
            stroke: accent ?? 'var(--line-strong)',
          },
        };
      case 'text':
        return {
          tag: 'text',
          attrs: {
            x: String(s.x),
            y: String(s.y),
            fill: accent ?? 'var(--text)',
            'font-family': s.mono ? 'var(--mono)' : 'var(--font)',
            'font-size': `${s.size ?? 16}px`,
          },
          text: s.text,
        };
      case 'arrow':
        return {
          tag: s.via ? 'path' : 'line',
          attrs: {
            ...(s.via
              ? { d: `M${s.x1} ${s.y1}Q${s.via.x} ${s.via.y} ${s.x2} ${s.y2}`, fill: 'none' }
              : { x1: String(s.x1), y1: String(s.y1), x2: String(s.x2), y2: String(s.y2) }),
            stroke: accent ?? 'var(--text-2)',
            'marker-end': 'url(#arrow-1-base)',
          },
        };
      case 'polygon':
        return {
          tag: 'polygon',
          attrs: {
            points: s.points.map((q) => `${q.x},${q.y}`).join(' '),
            fill: accent ?? 'var(--text-2)',
            'fill-opacity': '0.12',
          },
        };
    }
  };
  return [{ tag: 'defs', attrs: {}, children: [marker] }, ...scene.shapes.map(node)];
}

/** The last step of a page's first curated example, drawn for a laptop. */
function lastScene(def: AnyVizDef): Scene {
  const ex = def.examples[0]!;
  const settings = { ...def.defaults, ...ex.settings };
  const tl = new Timeline(def, settings, ex.seed, ex.ops);
  return def.view(tl.at(tl.length - 1).step, settings, LAPTOP_STAGE);
}

/**
 * A small XML well-formedness check: one root, every tag closed in order, attributes quoted,
 * only the five XML entities, no stray markup characters in text.
 */
function wellFormed(xml: string): string | null {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
  const stack: string[] = [];
  let roots = 0;
  const token = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(body))) {
    const [, close, name, , selfClose, text, stray] = m;
    if (stray) return `stray "<" at ${m.index}`;
    if (text !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos);)/.test(text)) return `bad entity in "${text}"`;
      if (text.includes('>')) return `stray ">" in "${text}"`;
      if (stack.length === 0 && text.trim()) return `text outside the root: "${text}"`;
      continue;
    }
    if (close) {
      if (stack.pop() !== name) return `</${name}> closes the wrong element`;
    } else {
      if (stack.length === 0) roots++;
      if (!selfClose) stack.push(name!);
    }
  }
  if (stack.length) return `unclosed <${stack.at(-1)}>`;
  return roots === 1 ? null : `${roots} root elements`;
}

const count = (svg: string, tag: string) =>
  svg.match(new RegExp(`<${tag}[\\s/>]`, 'g'))?.length ?? 0;

describe('reading colors', () => {
  it('reads the forms computed styles and themes use', () => {
    expect(hexColor('#2457c5')).toEqual({ hex: '#2457c5', alpha: 1 });
    expect(hexColor('#fff')).toEqual({ hex: '#ffffff', alpha: 1 });
    expect(hexColor('rgb(36, 87, 197)')).toEqual({ hex: '#2457c5', alpha: 1 });
    expect(hexColor('rgba(0, 0, 0, 0.5)')).toEqual({ hex: '#000000', alpha: 0.5 });
    expect(hexColor('rgb(16 24 40 / 6%)')).toEqual({ hex: '#101828', alpha: 0.06 });
    expect(hexColor('color(srgb 1 0.5 0)')).toEqual({ hex: '#ff8000', alpha: 1 });
    expect(hexColor('transparent')?.alpha).toBe(0);
    expect(hexColor('papayawhip')).toBeNull();
  });

  it('mixes colors as color-mix(in srgb) does', () => {
    // 14% of the accent into white, as a highlighted cell is filled.
    expect(hexColor('color-mix(in srgb, #2457c5 14%, #ffffff)')?.hex).toBe('#e0e7f7');
    expect(hexColor('color-mix(in srgb, #000000, #ffffff)')?.hex).toBe('#808080');
    expect(parseColor('color-mix(in srgb, nonsense 10%, #fff)')).toBeNull();
  });

  it('resolves nested variables and fallbacks', () => {
    const vars = { '--a': 'var(--b)', '--b': '#123456' };
    expect(resolveVars('var(--a)', vars)).toBe('#123456');
    expect(resolveVars('var(--missing, var(--b))', vars)).toBe('#123456');
    expect(resolveVars('color-mix(in srgb, var(--b) 50%, var(--b))', vars)).toBe(
      'color-mix(in srgb, #123456 50%, #123456)',
    );
  });
});

describe('the saved SVG', () => {
  const pages = ['stack-array', 'bst', 'dijkstra', 'convex-hull'].map((id) =>
    vizzes.find((d) => d.id === id)!,
  );

  for (const theme of ['light', 'dark', 'contrast'] as const) {
    for (const def of pages) {
      it(`${def.id} (${theme}): stands alone, with every shape`, () => {
        const scene = lastScene(def);
        const vars = themeVars(theme);
        const svg = pictureSvg(drawing(scene), {
          bounds: scene.bounds,
          width: 884,
          height: 387,
          background: 'var(--surface)',
          font: 'var(--font)',
          title: scene.label,
          vars,
        });
        expect(svg).not.toContain('var(');
        expect(svg).not.toContain('class=');
        expect(svg).not.toContain('style=');
        expect(svg).not.toMatch(/href|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
        expect(wellFormed(svg)).toBeNull();
        expect(svg).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg xmlns=/);

        // The background is the stage's color in this theme, and the system font stack stays.
        expect(svg).toContain(`fill="${hexColor(vars['--surface']!)!.hex}"`);
        expect(svg).toContain(`font-family="system-ui, -apple-system, 'Segoe UI'`);

        // Every shape is there, plus the background rectangle.
        const of = (k: Shape['kind']) => scene.shapes.filter((s) => s.kind === k).length;
        const arrows = scene.shapes.filter((s) => s.kind === 'arrow');
        expect(count(svg, 'rect')).toBe(of('rect') + 1);
        expect(count(svg, 'circle')).toBe(of('circle'));
        expect(count(svg, 'polygon')).toBe(of('polygon'));
        expect(count(svg, 'line')).toBe(arrows.filter((a) => !a.via).length);
        // Arrowheads are markers; one is kept when there are arrows to use it.
        expect(count(svg, 'path')).toBe(
          arrows.filter((a) => a.via).length + (arrows.length ? 1 : 0),
        );
        expect(count(svg, 'text')).toBe(of('text'));
        for (const s of scene.shapes) {
          if (s.kind !== 'text' || !s.text) continue;
          const shown = s.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          expect(svg).toContain(`>${shown}</text>`);
        }
        // Colors are plain hex, with any transparency in an opacity attribute.
        for (const m of svg.matchAll(/(?:fill|stroke)="([^"]*)"/g)) {
          expect(m[1]).toMatch(/^(#[0-9a-f]{6}|none|url\(#[\w-]+\))$/);
        }
      });
    }
  }

  it('escapes text and drops what a drawing never holds', () => {
    const svg = pictureSvg(
      [
        { tag: 'text', attrs: { x: '1', y: '2', fill: 'rgba(0,0,0,0.5)' }, text: 'a < b & "c"' },
        { tag: 'script', attrs: {}, text: 'alert(1)' },
        { tag: 'image', attrs: { href: 'https://example.com/x.png' } },
        { tag: 'rect', attrs: { onclick: 'x()', class: 'shape', fill: 'var(--nope)', x: '0' } },
      ],
      { bounds: { x: 0, y: 0, w: 10, h: 10 }, width: 10, height: 10, background: '#fff', font: '' },
    );
    expect(svg).toContain('>a &lt; b &amp; "c"</text>');
    expect(svg).toContain('fill="#000000" fill-opacity="0.5"');
    expect(svg).not.toMatch(/script|image|onclick|class=|example\.com|var\(/);
    expect(wellFormed(svg)).toBeNull();
  });

  it('keeps only the arrowheads that arrows use', () => {
    const head = (id: string): PictureNode => ({
      tag: 'marker',
      attrs: { id, viewBox: '0 0 10 10' },
      children: [{ tag: 'path', attrs: { d: 'M0 0L10 5L0 10z', fill: '#000' } }],
    });
    const svg = pictureSvg(
      [
        { tag: 'defs', attrs: {}, children: [head('arrow-1-base'), head('arrow-1-error')] },
        {
          tag: 'line',
          attrs: { x1: '0', y1: '0', x2: '5', y2: '5', 'marker-end': 'url(#arrow-1-error)' },
        },
      ],
      { bounds: { x: 0, y: 0, w: 10, h: 10 }, width: 10, height: 10, background: '#fff', font: '' },
    );
    expect(svg).toContain('id="arrow-1-error"');
    expect(svg).not.toContain('arrow-1-base');
    const bare = pictureSvg([{ tag: 'defs', attrs: {}, children: [head('arrow-1-base')] }], {
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      width: 10,
      height: 10,
      background: '#fff',
      font: '',
    });
    expect(bare).not.toContain('<defs');
  });

  it('is named after the page and the step', () => {
    expect(pictureName('bst', 7, 'svg')).toBe('bst-step-7.svg');
    expect(pictureName('stack-array', 1, 'png')).toBe('stack-array-step-1.png');
  });
});
