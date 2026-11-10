import { describe, expect, it } from 'vitest';
import { decodeExample, makeExample, validateExample } from '../engine/example';
import { stackArray } from '../viz/stack-array';
import {
  addRecent,
  encodeExampleNow,
  MAX_RECENT,
  parseRecent,
  timeAgo,
  type RecentPage,
} from './recent';

const page = (id: string, at = '2026-11-10T09:00:00.000Z'): RecentPage => ({
  id,
  title: id,
  code: null,
  step: 1,
  steps: 1,
  at,
});

describe('recent pages', () => {
  it('puts the latest first, once per page, and keeps three', () => {
    let list: RecentPage[] = [];
    for (const id of ['bst', 'dfa', 'avl', 'bst', 'heap-sort']) list = addRecent(list, page(id));
    expect(list.map((r) => r.id)).toEqual(['heap-sort', 'bst', 'avl']);
    expect(list).toHaveLength(MAX_RECENT);
  });

  it('reads only well-formed entries from storage', () => {
    const good = { ...page('bst'), code: 'zAbC_-', step: 4, steps: 9 };
    expect(
      parseRecent([
        good,
        { ...page('dfa'), code: 'not a code!' },
        { ...page('Bad Id') },
        { ...page('avl'), at: 'soon' },
        { ...good, title: 'again' },
        'x',
      ]),
    ).toEqual([good]);
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent({})).toEqual([]);
  });

  it('encodes an example at once in a form the example links read', async () => {
    const ex = makeExample(
      'stack-array',
      stackArray.defaults,
      7,
      [['push', 'naïve ✓'], ['push', 2], ['pop']],
      { op: 1, step: 0 },
    );
    const code = encodeExampleNow(ex);
    expect(code).toMatch(/^j[\w-]+$/);
    const back = validateExample(stackArray, await decodeExample(code));
    expect(back.ops).toEqual(ex.ops);
    expect(back.at).toEqual({ op: 1, step: 0 });
    expect(back.seed).toBe(7);
  });

  it('says how long ago in words', () => {
    const now = Date.parse('2026-11-10T12:00:00.000Z');
    const ago = (secs: number) => timeAgo(new Date(now - secs * 1000).toISOString(), now);
    expect(ago(10)).toBe('just now');
    expect(ago(5 * 60)).toBe('5 minutes ago');
    expect(ago(3 * 3600)).toBe('3 hours ago');
    expect(ago(26 * 3600)).toBe('yesterday');
    expect(ago(9 * 24 * 3600)).toBe('last week');
    // A clock that went backwards is "just now", not the future.
    expect(ago(-60)).toBe('just now');
  });
});
