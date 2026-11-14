import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { families } from '../catalog';
import { liveIds } from '../registry';
import {
  approachOf,
  approachSetting,
  DEFAULT_APPROACH,
  pattern,
  PATTERNS,
  spotItKind,
  Work,
  workVars,
  type SpotRow,
} from './kit';

const FAMILIES = [
  'Array and string tricks',
  'Intervals',
  'Linked list tricks',
  'Heap patterns',
  'Search templates',
  'Bit tricks',
  'DP patterns',
  'Design a data structure',
  'Techniques',
];

const LIVE_PATTERNS = [
  'floyd-cycle',
  'binary-search',
  'backtracking',
  'bitmask',
  'disjoint-sets',
  'topo-indegree',
  'trie',
  'lru-cache',
  'dijkstra',
];

describe('PATTERNS', () => {
  it('has distinct ids and names, and every page is in the catalog', () => {
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
    expect(new Set(PATTERNS.map((p) => p.name)).size).toBe(PATTERNS.length);
    const catalog = new Set(families.flatMap((f) => f.items.map((i) => i.id)));
    for (const p of PATTERNS) expect(catalog.has(p.page), p.page).toBe(true);
  });

  it('covers every page of the pattern families and the live pattern pages', () => {
    const pages = new Set(PATTERNS.map((p) => p.page));
    for (const name of FAMILIES) {
      const family = families.find((f) => f.name === name);
      expect(family, name).toBeDefined();
      for (const item of family!.items) expect(pages.has(item.id), item.id).toBe(true);
    }
    for (const id of LIVE_PATTERNS) {
      expect(pages.has(id), id).toBe(true);
      expect(liveIds, id).toContain(id);
    }
  });

  it('looks patterns up by id and refuses unknown ones', () => {
    expect(pattern('sliding-window').name).toBe('Sliding window');
    expect(() => pattern('slidin-window')).toThrow(/No pattern/);
  });

  it('keeps names short enough to be choice options', () => {
    for (const p of PATTERNS) expect(p.name.length, p.name).toBeLessThanOrEqual(40);
  });
});

describe('approach setting', () => {
  it('lists the pattern first and defaults to it', () => {
    const s = approachSetting({ pattern: 'Running sum, O(n)', naive: 'Every pair, O(n²)' });
    expect(s.kind).toBe('choice');
    expect(s.key).toBe('approach');
    if (s.kind !== 'choice') return;
    expect(s.options.map((o) => o.value)).toEqual(['pattern', 'naive']);
    expect(s.options[0]!.label).toBe('Running sum, O(n)');
    expect(s.help).toMatch(/Compare/);
    expect(DEFAULT_APPROACH).toBe('pattern');
    expect(approachOf({ approach: 'naive' })).toBe('naive');
    expect(approachOf({ approach: 'pattern' })).toBe('pattern');
    expect(approachOf({})).toBe('pattern');
  });
});

describe('Work', () => {
  it('counts each unit, in order, and words the tally', () => {
    const w = new Work(['sums', 'lookups', 'comparisons', 'map ops']);
    expect(w.tally()).toBe('no sums, no lookups, no comparisons and no map ops');
    w.add('sums');
    w.add('lookups', 3);
    w.add('comparisons');
    w.add('map ops');
    expect(w.vars()).toEqual({ sums: 1, lookups: 3, comparisons: 1, 'map ops': 1 });
    expect(Object.keys(w.vars())).toEqual(['sums', 'lookups', 'comparisons', 'map ops']);
    expect(w.total).toBe(6);
    expect(w.tally()).toBe('1 sum, 3 lookups, 1 comparison and 1 map op');
    expect(new Work(['entries']).tally()).toBe('no entries');
    const one = new Work(['entries']);
    one.add('entries');
    expect(one.tally()).toBe('1 entry');
    expect(() => w.add('sum')).toThrow(/Unknown work unit/);
  });

  it('puts the totals after the live counters', () => {
    const w = new Work(['sums', 'lookups']);
    w.add('sums', 2);
    expect(Object.entries(workVars(w, { naive: 10, pattern: 6 }))).toEqual([
      ['sums', 2],
      ['lookups', 0],
      ['naive total', 10],
      ['pattern total', 6],
    ]);
  });
});

const ROWS: SpotRow[] = [
  {
    problem: 'Count the stretches of an array of gains and losses that add up to exactly k.',
    pattern: 'prefix-sum-hashmap',
    cue: ['stretches', 'add up to exactly k'],
    why: 'Each stretch is a difference of two running sums.',
    near: ['sliding-window', 'kadane'],
  },
  {
    problem: 'Find the longest stretch of a list of positive numbers whose sum is at most k.',
    pattern: 'sliding-window',
    cue: 'positive',
    why: 'With no negatives, a window that grows only gains.',
    alsoFits: ['prefix-sum-hashmap', 'binary-search'],
  },
];

describe('spotItKind', () => {
  const kind = spotItKind({ page: 'prefix-sum-hashmap', rows: ROWS, watch: [['find', 7]] });

  it('makes the same question from the same seed', () => {
    for (const seed of [1, 2, 3, 99]) {
      expect(kind.make(makeRng(seed))).toEqual(kind.make(makeRng(seed)));
    }
  });

  it('offers the right pattern and three others, never one that also fits', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const q = kind.make(makeRng(seed));
      const row = ROWS.find((r) => q.prompt.includes(r.problem))!;
      expect(row).toBeDefined();
      seen.add(row.pattern);
      expect(q.answer.kind).toBe('choice');
      if (q.answer.kind !== 'choice') continue;
      const { options, correct } = q.answer;
      expect(options).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
      expect(options[correct]).toBe(pattern(row.pattern).name);
      for (const id of row.alsoFits ?? []) expect(options).not.toContain(pattern(id).name);
      for (const id of row.near ?? []) expect(options).toContain(pattern(id).name);
      expect(q.explain).toContain(pattern(row.pattern).name);
      const cues = typeof row.cue === 'string' ? [row.cue] : row.cue;
      for (const c of cues) expect(q.explain).toContain(`“${c}”`);
      // Show me plays only for this page's own pattern.
      if (row.pattern === 'prefix-sum-hashmap') expect(q.watch).toEqual([['find', 7]]);
      else expect(q.watch).toBeUndefined();
      expect(q.setup).toEqual([]);
    }
    expect(seen.size).toBe(2);
  });

  it('refuses unknown patterns and rows that offer their own pattern', () => {
    const bad = (row: Partial<SpotRow>) => () =>
      spotItKind({ page: 'x', rows: [{ ...ROWS[0]!, ...row }] });
    expect(bad({ pattern: 'nope' })).toThrow(/No pattern/);
    expect(bad({ near: ['nope'] })).toThrow(/No pattern/);
    expect(bad({ near: ['prefix-sum-hashmap'] })).toThrow(/its own pattern/);
    expect(bad({ near: ['kadane'], alsoFits: ['kadane'] })).toThrow(/both/);
    expect(() => spotItKind({ page: 'x', rows: [] })).toThrow(/at least one/);
  });
});
