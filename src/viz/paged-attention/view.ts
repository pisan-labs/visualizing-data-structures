/**
 * Paged attention: the block tables (one row per running request: logical block i holds the
 * number of the physical block it maps to), the free list (top first), and the pool of physical
 * blocks. A block's header gives its number and who uses it: a request's letter, or ×2, ×3 for a
 * block several tables share. A slot shows the position of the token whose key and value it
 * holds; a dashed block is free. A request's table and its own blocks share a group color.
 *
 * A laptop draws the tables and the free list left of the pool, with 16 slots to a pool row; a
 * phone draws the pool on top with 8 slots to a row, and the rest under it. The frame is sized
 * for the most the page can show (six requests, the longest table, a full free list), so the
 * camera stays still.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { groupRole } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds } from '../../layouts/graph';
import { textWidth } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_CORNER } from '../../render/stage';
import {
  describe,
  MAX_LEN,
  MAX_SEQS,
  NAMES,
  POOL_SLOTS,
  readersOf,
  sizeOf,
  type PagedExtra,
  type PagedSettings,
  type PagedState,
} from './model';

const SLOT = 30;
const BLOCK_GAP = 10;
const HEAD = 18;
const ROW_GAP = 6;
const TITLE = 26;
const TITLE_SIZE = 15;
const VALUE_SIZE = 15;
const SMALL = 13;
const LABEL_W = 28;
/** Free blocks shown, in rows of FREE_ROW; the rest are counted. */
const FREE_SHOWN = 16;
const FREE_ROW = 8;
const SECTION_GAP = 26;

type Roles = ReadonlyMap<string, MarkRole>;

const ownerRole = (name: string): MarkRole => groupRole(NAMES.indexOf(name) + 1);

const text = (
  id: string,
  x: number,
  y: number,
  t: string,
  o: Partial<Extract<Shape, { kind: 'text' }>> = {},
): Shape => ({ kind: 'text', id, x, y, text: t, size: VALUE_SIZE, mono: true, ...o });

/** The pool: rows of `perRow` slots, cut into blocks. Returns its box. */
function drawPool(
  out: Shape[],
  s: PagedState,
  settings: PagedSettings,
  roles: Roles,
  x0: number,
  y0: number,
  perRow: number,
  extra: PagedExtra,
): Bounds {
  const B = sizeOf(settings);
  const per = perRow / B;
  const rows = POOL_SLOTS / perRow;
  const blockW = B * SLOT;
  out.push(
    text('pool-title', x0, y0 + 17, 'physical blocks', { size: TITLE_SIZE, weight: 'bold' }),
  );
  s.blocks.forEach((b, p) => {
    const x = x0 + (p % per) * (blockW + BLOCK_GAP);
    const y = y0 + TITLE + Math.floor(p / per) * (HEAD + SLOT + ROW_GAP) + HEAD;
    const readers = b.ref > 0 ? readersOf(s, p) : [];
    const own = b.ref === 1 && readers.length === 1 ? ownerRole(readers[0]!) : undefined;
    out.push(
      text(`b-${p}-h`, x + 1, y - 5, String(p), {
        size: SMALL,
        weight: 'bold',
        role: roles.get(`b-${p}-h`),
      }),
    );
    if (b.ref > 0)
      out.push(
        text(`b-${p}-o`, x + blockW - 1, y - 5, b.ref > 1 ? `×${b.ref}` : (readers[0] ?? ''), {
          size: SMALL,
          anchor: 'end',
          cls: b.ref > 1 ? undefined : 'label',
          weight: b.ref > 1 ? 'bold' : 'normal',
        }),
      );
    for (let i = 0; i < B; i++) {
      const id = `b-${p}-${i}`;
      out.push({
        kind: 'rect',
        id,
        x: x + i * SLOT,
        y,
        w: SLOT,
        h: SLOT,
        r: 2,
        cls: b.ref > 0 ? 'live' : 'ghost',
        role: roles.get(id) ?? own,
      });
      const tok = b.tokens[i];
      if (tok !== undefined) {
        const copied = extra.copied?.to === p;
        const fromX = copied ? blockX(extra.copied!.from) : 0;
        const fromY = copied ? blockY(extra.copied!.from) : 0;
        out.push(
          text(`${id}-t`, x + i * SLOT + SLOT / 2, y + SLOT / 2 + 5, String(tok), {
            anchor: 'middle',
            ...(copied
              ? { enterFrom: { x: fromX + i * SLOT + SLOT / 2, y: fromY + SLOT / 2 + 5 } }
              : {}),
          }),
        );
      }
    }
  });
  function blockX(p: number) {
    return x0 + (p % per) * (blockW + BLOCK_GAP);
  }
  function blockY(p: number) {
    return y0 + TITLE + Math.floor(p / per) * (HEAD + SLOT + ROW_GAP) + HEAD;
  }
  return {
    x: x0,
    y: y0,
    w: per * blockW + (per - 1) * BLOCK_GAP,
    h: TITLE + rows * (HEAD + SLOT + ROW_GAP) - ROW_GAP,
  };
}

/** The block tables, one row per running request, with the logical block numbers on top. */
function drawTables(
  out: Shape[],
  s: PagedState,
  settings: PagedSettings,
  roles: Roles,
  x0: number,
  y0: number,
): Bounds {
  const cols = MAX_LEN / sizeOf(settings);
  out.push(text('tables-title', x0, y0 + 17, 'block tables', { size: TITLE_SIZE, weight: 'bold' }));
  const top = y0 + TITLE + HEAD;
  for (let c = 0; c < cols; c++)
    out.push(
      text(`lb-${c}`, x0 + LABEL_W + c * SLOT + SLOT / 2, top - 5, String(c), {
        size: SMALL,
        anchor: 'middle',
        cls: 'label',
      }),
    );
  s.seqs.forEach((q, r) => {
    const y = top + r * (SLOT + ROW_GAP);
    out.push(
      text(`t-${q.name}`, x0 + LABEL_W - 8, y + SLOT / 2 + 5, q.name, {
        anchor: 'end',
        weight: 'bold',
        role: roles.get(`t-${q.name}`),
      }),
    );
    q.table.forEach((p, i) => {
      const id = `t-${q.name}-${i}`;
      out.push({
        kind: 'rect',
        id,
        x: x0 + LABEL_W + i * SLOT,
        y,
        w: SLOT,
        h: SLOT,
        r: 2,
        cls: 'live',
        role: roles.get(id) ?? ownerRole(q.name),
      });
      out.push(
        text(`${id}-t`, x0 + LABEL_W + i * SLOT + SLOT / 2, y + SLOT / 2 + 5, String(p), {
          anchor: 'middle',
        }),
      );
    });
    out.push(
      text(
        `t-${q.name}-len`,
        x0 + LABEL_W + q.table.length * SLOT + 8,
        y + SLOT / 2 + 5,
        `${q.len} tok${q.parent ? `, from ${q.parent}` : ''}`,
        { size: SMALL, cls: 'label' },
      ),
    );
  });
  return {
    x: x0,
    y: y0,
    w: LABEL_W + cols * SLOT + 8 + textWidth('16 tok, from A', SMALL, true),
    h: TITLE + HEAD + MAX_SEQS * (SLOT + ROW_GAP) - ROW_GAP,
  };
}

/** The free list, top first, in rows of FREE_ROW. */
function drawFree(out: Shape[], s: PagedState, roles: Roles, x0: number, y0: number): Bounds {
  out.push(
    text('free-title', x0, y0 + 17, 'free list, top first', { size: TITLE_SIZE, weight: 'bold' }),
  );
  const top = y0 + TITLE;
  s.free.slice(0, FREE_SHOWN).forEach((p, k) => {
    const x = x0 + (k % FREE_ROW) * SLOT;
    const y = top + Math.floor(k / FREE_ROW) * (SLOT + ROW_GAP);
    out.push({
      kind: 'rect',
      id: `f-${p}`,
      x,
      y,
      w: SLOT,
      h: SLOT,
      r: 2,
      cls: 'live',
      role: roles.get(`f-${p}`),
    });
    out.push(text(`f-${p}-t`, x + SLOT / 2, y + SLOT / 2 + 5, String(p), { anchor: 'middle' }));
  });
  if (s.free.length > FREE_SHOWN)
    out.push(
      text(
        'free-more',
        x0 + FREE_ROW * SLOT + 8,
        top + SLOT + ROW_GAP + SLOT / 2 + 5,
        `+${s.free.length - FREE_SHOWN}`,
        { size: SMALL, cls: 'label' },
      ),
    );
  if (!s.free.length)
    out.push(text('free-none', x0, top + SLOT / 2 + 5, 'empty', { size: SMALL, cls: 'label' }));
  const rows = Math.ceil(FREE_SHOWN / FREE_ROW);
  return {
    x: x0,
    y: y0,
    w: FREE_ROW * SLOT + 40,
    h: TITLE + rows * (SLOT + ROW_GAP) - ROW_GAP,
  };
}

const union = (...bs: Bounds[]): Bounds => {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...bs.map((b) => b.x + b.w)) - x,
    h: Math.max(...bs.map((b) => b.y + b.h)) - y,
  };
};

export function view(
  step: Step<PagedState, PagedExtra>,
  settings: PagedSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  // Without a strip of their own, the zoom buttons cover the top right corner.
  const top = stage && !stage.strip ? ZOOM_CORNER.h : 0;

  // Tables left of the pool and the free list; or the pool, the free list and the tables in a
  // column. Pool rows of 16, 12 or 8 slots, whichever the block size divides.
  const side = (perRow: number) => {
    const shapes: Shape[] = [];
    const t = drawTables(shapes, s, settings, roles, 0, top);
    const x = t.w + SECTION_GAP + 10;
    const p = drawPool(shapes, s, settings, roles, x, top, perRow, extra);
    const f = drawFree(shapes, s, roles, x, p.y + p.h + SECTION_GAP);
    return { shapes, bounds: padBounds(union(t, p, f, { x: 0, y: 0, w: 1, h: 1 }), 12) };
  };
  const column = (perRow: number) => {
    const shapes: Shape[] = [];
    const p = drawPool(shapes, s, settings, roles, 0, top, perRow, extra);
    const f = drawFree(shapes, s, roles, 0, p.y + p.h + SECTION_GAP);
    const t = drawTables(shapes, s, settings, roles, 0, f.y + f.h + SECTION_GAP);
    return { shapes, bounds: padBounds(union(p, t, f, { x: 0, y: 0, w: 1, h: 1 }), 12) };
  };
  const rows = [16, 12, 8].filter((r) => r % sizeOf(settings) === 0);
  const options = [side(16), ...rows.map(column)];
  const best = pickLayout(stage, options);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s, settings) };
}
