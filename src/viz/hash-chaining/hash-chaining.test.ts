import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { hashChaining } from '.';
import {
  hashOf,
  loadFactor,
  parseKeyInput,
  readKey,
  type HashFn,
  type Key,
} from '../_hashing/hashing';
import {
  collidingKeys,
  longestOf,
  sizeOf,
  type ChainExtra,
  type ChainSettings,
  type ChainState,
} from './model';

type T = Timeline<ChainState, ChainSettings, ChainExtra>;

const settings = (s: Partial<ChainSettings> = {}): ChainSettings =>
  ({ ...hashChaining.defaults, ...s }) as ChainSettings;
const run = (calls: OpCall[], s: Partial<ChainSettings> = {}): T =>
  new Timeline(hashChaining, settings(s), 1, calls);
const lastStep = (t: T, k: number) => t.entries[k]!.steps.at(-1)!;
const keysOf = (s: ChainState, b: number) => s.buckets[b]!.map((e) => e.key);

/** Invariants that hold at every step, mid-operation included. */
function checkStep(s: ChainState, st: ChainSettings, vars: Record<string, unknown> | undefined) {
  expect(s.m).toBe(st.m);
  expect(s.buckets.length).toBe(st.m);
  const uids = s.buckets.flat().map((e) => e.uid);
  expect(new Set(uids).size, 'uids are unique').toBe(uids.length);
  for (const u of uids) expect(u).toBeLessThan(s.nextUid);
  s.buckets.forEach((chain, b) => {
    const keys = chain.map((e) => e.key);
    expect(new Set(keys).size, `bucket ${b} has no duplicate keys`).toBe(keys.length);
    for (const k of keys) expect(hashOf(k, st.m, st.hash).index, `${k} is in its bucket`).toBe(b);
  });
  expect(vars?.n).toBe(sizeOf(s));
  expect(vars?.m).toBe(st.m);
  expect(vars?.α).toBe(loadFactor(sizeOf(s), st.m));
  expect(vars?.longest).toBe(longestOf(s));
}

describe('separate chaining', () => {
  it('narrates the hash with real numbers', () => {
    const t = run([['insert', 42]]);
    expect(t.entries[0]!.steps[0]!.say).toContain('h(42) = 42 mod 7 = 0');
    const s = run([['insert', 'cat']], { hash: 'sum' });
    expect(s.entries[0]!.steps[0]!.say).toContain('(99 + 97 + 116) mod 7 = 312 mod 7 = 4');
    const p = run([['insert', 'cat']], { hash: 'poly' });
    expect(p.entries[0]!.steps[0]!.say).toContain('(99·31² + 97·31 + 116) mod 7 = 98262 mod 7 = 3');
    const m = run([['insert', 42]], { hash: 'multiplication' });
    expect(m.entries[0]!.steps[0]!.say).toContain('42 × 0.618034 = 25.9574');
    expect(m.entries[0]!.steps[0]!.vars?.i).toBe(6);
  });

  it('puts colliding keys in one chain, newest first by default', () => {
    const calls: OpCall[] = [10, 17, 24, 3].map((k) => ['insert', k]);
    expect(keysOf(run(calls).endState(), 3)).toEqual([3, 24, 17, 10]);
    expect(keysOf(run(calls, { where: 'tail' }).endState(), 3)).toEqual([10, 17, 24, 3]);
    const head = run([...calls, ['search', 17]]);
    expect(lastStep(head, 4).vars?.compares).toBe(3);
    const tail = run([...calls, ['search', 17]], { where: 'tail' });
    expect(lastStep(tail, 4).vars?.compares).toBe(2);
  });

  it('keeps one copy of a key, and a map updates the value', () => {
    const set = run([
      ['insert', 5],
      ['insert', 5],
    ]);
    expect(sizeOf(set.endState())).toBe(1);
    expect(lastStep(set, 1).lines).toContain('ins.dup');
    const map = run(
      [
        ['insert', 'cat=3'],
        ['insert', 'cat=4'],
        ['search', 'cat'],
      ],
      { mode: 'pairs', hash: 'poly' },
    );
    expect(sizeOf(map.endState())).toBe(1);
    expect(lastStep(map, 2).vars?.returned).toBe('4');
  });

  it('deletes from the front, the middle and an empty bucket', () => {
    const t = run([
      ...[3, 10, 17, 24].map((k): OpCall => ['insert', k]),
      ['delete', 17],
      ['delete', 24],
      ['delete', 99],
    ]);
    expect(lastStep(t, 4).lines).toEqual(['del.bypass']);
    expect(lastStep(t, 5).lines).toEqual(['del.head']);
    expect(lastStep(t, 6).lines).toContain('del.miss');
    expect(keysOf(t.endState(), 3)).toEqual([10, 3]);
  });

  it('rejects words under a number hash and changes nothing', () => {
    const t = run([['insert', 'cat']]);
    expect(lastStep(t, 0).lines).toEqual(['ins.sig']);
    expect(lastStep(t, 0).say).toContain('not a whole number');
    expect(sizeOf(t.endState())).toBe(0);
  });

  it('fills one bucket with colliding keys under every hash function', () => {
    for (const hash of ['division', 'multiplication', 'sum', 'poly'] as HashFn[]) {
      for (const m of [1, 5, 7, 13, 16]) {
        const st = settings({ hash, m });
        const { keys, bucket } = collidingKeys(makeRng(m), st, 8);
        expect(keys.length).toBe(8);
        for (const k of keys) expect(hashOf(k, m, hash).index).toBe(bucket);
        const t = new Timeline(hashChaining, st, 1, [['fill', 'collide', 8]]);
        expect(longestOf(t.endState()), `${hash}, m = ${m}`).toBe(8);
      }
    }
  });

  it('matches a reference map for any sequence of operations', () => {
    const value = fc.oneof(
      fc.integer({ min: 0, max: 40 }),
      fc.constantFrom('cat', 'act', 'dog', 'A', 'B', 'cat=1', 'cat=2', '7=x', 'zebra', -3),
    );
    const call: fc.Arbitrary<OpCall> = fc.oneof(
      value.map((v) => ['insert', v] as OpCall),
      value.map((v) => ['search', v] as OpCall),
      value.map((v) => ['delete', v] as OpCall),
      fc.constant(['clear'] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 16 }),
        fc.constantFrom<HashFn>('division', 'multiplication', 'sum', 'poly'),
        fc.constantFrom('keys' as const, 'pairs' as const),
        fc.constantFrom('head' as const, 'tail' as const),
        fc.array(call, { maxLength: 40 }),
        (m, hash, mode, where, calls) => {
          const st = settings({ m, hash, mode, where });
          const t = new Timeline(hashChaining, st, 1, calls);
          const ref = new Map<Key, string | null>();
          /** Each bucket's keys in chain order, kept by hand. */
          const chains: Key[][] = Array.from({ length: m }, () => []);
          calls.forEach(([op, raw], k) => {
            const last = lastStep(t, k);
            if (op === 'clear') {
              ref.clear();
              chains.forEach((c) => (c.length = 0));
              return;
            }
            const a = readKey(raw as Value, hash);
            if (a instanceof Error) {
              expect(last.lines[0]).toMatch(/\.sig$/);
              return;
            }
            const b = hashOf(a.key, m, hash).index;
            expect(last.vars?.i).toBe(b);
            const had = ref.has(a.key);
            if (op === 'insert') {
              if (!had) {
                ref.set(a.key, mode === 'pairs' ? a.value : null);
                if (where === 'head') chains[b]!.unshift(a.key);
                else chains[b]!.push(a.key);
              } else if (mode === 'pairs') {
                ref.set(a.key, a.value);
              }
              if (had && mode === 'keys') expect(last.lines).toContain('ins.dup');
            } else if (op === 'search') {
              expect(last.vars?.found).toBe(had);
              if (had) {
                expect(last.vars?.compares).toBe(chains[b]!.indexOf(a.key) + 1);
                if (mode === 'pairs')
                  expect(last.vars?.returned).toBe(ref.get(a.key) ?? 'no value');
              } else {
                expect(last.vars?.compares).toBe(chains[b]!.length);
              }
            } else {
              expect(last.lines.includes('del.miss')).toBe(!had);
              ref.delete(a.key);
              chains[b] = chains[b]!.filter((x) => x !== a.key);
            }
          });
          const end = t.endState();
          for (let b = 0; b < m; b++) expect(keysOf(end, b)).toEqual(chains[b]);
          for (const [key, v] of ref) {
            const e = end.buckets.flat().find((x) => x.key === key)!;
            expect(e.value).toBe(v);
          }
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            checkStep(step.state, st, step.vars);
          }
        },
      ),
      { numRuns: 250 },
    );
  });

  it('parses input', () => {
    expect(parseKeyInput('42')).toBe(42);
    expect(parseKeyInput('cat')).toBe('cat');
    expect(parseKeyInput('cat=3')).toBe('cat=3');
    expect(parseKeyInput(' 7 = x ')).toBe('7=x');
    expect(parseKeyInput('')).toBeInstanceOf(Error);
    expect(parseKeyInput('-4')).toBeInstanceOf(Error);
    expect(parseKeyInput('1000')).toBeInstanceOf(Error);
    expect(parseKeyInput('toolong')).toBeInstanceOf(Error);
    expect(parseKeyInput('a=b=c')).toBeInstanceOf(Error);
    expect(parseKeyInput('cat=')).toBeInstanceOf(Error);
  });
});
