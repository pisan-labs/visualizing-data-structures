import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { fibonacci, huffman, pairs, parseHuffInput } from '.';
import {
  before,
  countOf,
  fixedWidth,
  readSource,
  totalBits,
  type HuffSettings,
  type HuffState,
} from './model';

// ---------------------------------------------------------------------------------------------
// Reference: a plain Huffman build over a list that is sorted again every round, written
// independently of the model.

interface RTree {
  weight: number;
  leaf: boolean;
  order: number;
  sym?: string;
  left?: RTree;
  right?: RTree;
}

function refBuild(freq: [string, number][], ties: HuffSettings['ties'], rounds = Infinity) {
  let order = 0;
  let list: RTree[] = [...freq]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([sym, w]) => ({ weight: w, leaf: true, order: order++, sym }));
  const key = (t: RTree): [number, number, number] => [
    t.weight,
    ties === 'merged' ? (t.leaf ? 1 : 0) : 0,
    t.order,
  ];
  const cmp = (a: RTree, b: RTree) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  };
  /** The cost of the tree: each merge adds the weight of the new node. */
  let cost = 0;
  for (let r = 0; list.length > 1 && r < rounds; r++) {
    list.sort(cmp);
    const [x, y, ...rest] = list as [RTree, RTree, ...RTree[]];
    const z: RTree = {
      weight: x.weight + y.weight,
      leaf: false,
      order: order++,
      left: x,
      right: y,
    };
    cost += z.weight;
    list = [...rest, z];
  }
  const codes: Record<string, string> = {};
  const walk = (t: RTree, code: string) => {
    if (t.leaf) codes[t.sym!] = code || '0';
    else {
      walk(t.left!, code + '0');
      walk(t.right!, code + '1');
    }
  };
  list.sort(cmp);
  if (list.length === 1) walk(list[0]!, '');
  // With one symbol there are no merges, but its one-bit code still costs a bit per symbol.
  if (freq.length === 1) cost = freq[0]![1];
  return { codes, cost, queue: list };
}

/** "c (1)" for a leaf, "the tree cd (2)" for a merged tree, as the narration names them. */
function refName(t: RTree): string {
  const leaves = (u: RTree): string => (u.leaf ? u.sym! : leaves(u.left!) + leaves(u.right!));
  return t.leaf ? `${t.sym} (${t.weight})` : `the tree ${leaves(t)} (${t.weight})`;
}

/** Structure every step must keep. */
function checkState(s: HuffState, ties: HuffSettings['ties']) {
  const roots = [...s.held, ...s.queue];
  const seen = new Set<number>();
  const leaves: string[] = [];
  const walk = (u: number): number => {
    expect(seen.has(u), `node ${u} in one tree only`).toBe(false);
    seen.add(u);
    const n = s.nodes[u]!;
    expect(n.uid).toBe(u);
    if (n.sym !== null) {
      expect(n.left).toBeNull();
      expect(n.right).toBeNull();
      leaves.push(n.sym);
      expect(n.weight).toBe(s.freq.find(([sym]) => sym === n.sym)![1]);
      return n.weight;
    }
    const w = walk(n.left!) + walk(n.right!);
    expect(n.weight, 'a merged node weighs as much as its two children').toBe(w);
    return w;
  };
  for (const r of roots) walk(r);
  expect(seen.size, 'every node is in a tree').toBe(Object.keys(s.nodes).length);
  expect(leaves.sort()).toEqual(s.freq.map(([sym]) => sym).sort());
  for (let i = 1; i < s.queue.length; i++)
    expect(before(s.nodes[s.queue[i - 1]!]!, s.nodes[s.queue[i]!]!, ties), 'queue in order').toBe(
      true,
    );
  if (s.codes) {
    expect(s.held).toEqual([]);
    expect(s.queue).toHaveLength(1);
  }
}

/** No code is the start of another. */
function prefixFree(codes: string[]) {
  for (const a of codes)
    for (const b of codes) if (a !== b) expect(b.startsWith(a), `${a} starts ${b}`).toBe(false);
}

const pairsArb = fc
  .uniqueArray(fc.constantFrom(...'abcdefgh'), { minLength: 1, maxLength: 8 })
  .chain((syms) =>
    fc
      .array(fc.integer({ min: 1, max: 6 }), { minLength: syms.length, maxLength: syms.length })
      .map((ws) => syms.map((s, i) => `${s}:${ws[i]}`).join(' ')),
  );
const textArb = fc
  .array(fc.constantFrom('a', 'b', 'c', 'd', ' ', 'e'), { minLength: 1, maxLength: 24 })
  .map((xs) => xs.join('').trim() || 'a');
const bitsArb = fc
  .array(fc.constantFrom('0', '1'), { minLength: 1, maxLength: 20 })
  .map((xs) => xs.join(''));

const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 3, arbitrary: fc.oneof(pairsArb, textArb).map((x) => ['build', x] as OpCall) },
  { weight: 2, arbitrary: fc.oneof(pairsArb, textArb).map((x) => ['load', x] as OpCall) },
  { weight: 3, arbitrary: fc.constant(['merge'] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['encode'] as OpCall) },
  { weight: 2, arbitrary: bitsArb.map((b) => ['decode', b] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

describe('huffman', () => {
  it('builds the reference tree, optimal and prefix-free, keeping its rules on every step', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<HuffSettings['ties']>('leaves', 'merged'),
        fc.array(callArb, { maxLength: 14 }),
        (ties, calls) => {
          const t = new Timeline(huffman, { ties }, 1, calls);
          t.entries.forEach((entry, i) => {
            for (const step of entry.steps) checkState(step.state, ties);
            const end = entry.end;
            const [op, arg] = entry.call;
            const last = entry.steps.at(-1)!;
            if (end.codes) {
              const ref = refBuild(end.freq, ties);
              expect(end.codes, 'the codes follow the tie rule').toEqual(ref.codes);
              expect(totalBits(end), 'the total is optimal').toBe(ref.cost);
              prefixFree(Object.values(end.codes));
              if (end.freq.length > 1) {
                // A full binary tree: the code lengths fill the Kraft sum exactly.
                const kraft = Object.values(end.codes).reduce((a, c) => a + 2 ** -c.length, 0);
                expect(kraft).toBeCloseTo(1, 12);
              }
              expect(last.vars?.bits).toBe(op === 'encode' ? ref.cost : totalBits(end));
              expect(last.vars?.fixed).toBe(countOf(end) * fixedWidth(end.freq.length));
            }
            if (op === 'encode' && end.codes && end.text !== null) {
              expect(last.extra?.totals?.huffman).toBe(totalBits(end));
            }
            if (op === 'decode' && end.codes) {
              const bits = String(arg);
              // Decode greedily with the code table: prefix-free codes leave no choice.
              const byCode = new Map(Object.entries(end.codes).map(([s, c]) => [c, s]));
              let out = '';
              let cur = '';
              let ok = true;
              for (const b of bits) {
                cur += b;
                if (byCode.has(cur)) {
                  out += byCode.get(cur)!;
                  cur = '';
                } else if (![...byCode.keys()].some((c) => c.startsWith(cur))) {
                  ok = false;
                  break;
                }
              }
              ok = ok && cur === '';
              expect(last.lines.includes('d.done')).toBe(ok);
              if (ok) expect(last.vars?.out).toBe(out);
            }
            if (op === 'encode' || op === 'decode') {
              expect(end).toEqual(i === 0 ? t.initial.state : t.entries[i - 1]!.end);
            }
          });
        },
      ),
      { numRuns: 250 },
    );
  });

  it('encodes a text into bits that decode back to it', () => {
    fc.assert(
      fc.property(textArb, (text) => {
        const t = new Timeline(huffman, huffman.defaults, 1, [['build', text], ['encode']]);
        const end = t.endState();
        const bits = [...end.text!].map((s) => end.codes![s]).join('');
        if (bits.length > 64) return;
        const back = new Timeline(huffman, huffman.defaults, 1, [
          ['build', text],
          ['decode', bits],
        ]);
        expect(back.entries[1]!.steps.at(-1)!.vars?.out).toBe(end.text);
      }),
      { numRuns: 100 },
    );
  });

  it('gives the same total under either tie rule, but not always the same codes', () => {
    const run = (ties: HuffSettings['ties']) =>
      new Timeline(huffman, { ties }, 1, [['build', 'abracadabra']]).endState();
    expect(totalBits(run('leaves'))).toBe(23);
    expect(totalBits(run('merged'))).toBe(23);
    expect(run('leaves').codes).toEqual({ a: '0', b: '110', c: '100', d: '101', r: '111' });
    expect(run('merged').codes).toEqual({ a: '0', b: '111', c: '1100', d: '1101', r: '10' });
  });

  it('narrates the tie rule when it decides, and names the trees', () => {
    const t = new Timeline(huffman, huffman.defaults, 1, [['build', 'abracadabra']]);
    const says = t.entries[0]!.steps.map((s) => s.say);
    expect(says).toContain(
      '3 trees weigh 2: b (2), r (2) and the tree cd (2). Equal weights: leaves come first, in symbol order, then merged trees, oldest first. So take b (2) and r (2).',
    );
    expect(says.at(-1)).toContain('11 symbols take 23 bits with these codes');
  });

  it('gives a lone symbol the code 0, and catches bits that stop inside a code', () => {
    const one = new Timeline(huffman, huffman.defaults, 1, [
      ['build', 'aaaa'],
      ['decode', '000'],
      ['decode', '01'],
    ]);
    expect(one.entries[0]!.end.codes).toEqual({ a: '0' });
    expect(one.entries[1]!.steps.at(-1)!.vars?.out).toBe('aaa');
    expect(one.entries[2]!.steps.at(-1)!.lines).toContain('d.bad');
    const abra = new Timeline(huffman, huffman.defaults, 1, [
      ['build', 'abracadabra'],
      ['decode', '011'],
    ]);
    expect(abra.entries[1]!.steps.at(-1)!.say).toContain(
      'the last 2 bits, 11, are not a whole code',
    );
  });

  it('refuses bad input with a reason, and changes nothing', () => {
    const t = new Timeline(huffman, huffman.defaults, 1, [
      ['build', 'abc'],
      ['build', 'a:5 a:3'],
      ['build', 'x:0'],
      ['load', 'semi;colon'],
      ['decode', '0120'],
      ['build', 'abcdefghijklm'],
    ]);
    for (const e of t.entries.slice(1)) expect(e.end).toEqual(t.entries[0]!.end);
    expect(readSource('a:5 a:3')).toBeInstanceOf(Error);
    expect(readSource('abcdefghijklm')).toBeInstanceOf(Error);
    expect(parseHuffInput(' abracadabra ')).toBe('abracadabra');
    expect(parseHuffInput('0110')).toBe('0110');
    expect(parseHuffInput('a:5 b:2')).toBe('a:5 b:2');
    expect(parseHuffInput('a:five')).toBeInstanceOf(Error);
    expect(parseHuffInput('tab\tbed')).toBeInstanceOf(Error);
    const merges = new Timeline(huffman, huffman.defaults, 1, [['merge'], ['encode']]);
    for (const e of merges.entries) expect(e.steps.at(-1)!.say).toContain('Build');
  });

  it('builds the preset shapes it promises', () => {
    // Fibonacci counts give the deepest tree: codes of 1 to n - 1 bits.
    const end = new Timeline(huffman, huffman.defaults, 1, [
      ['build', pairs(fibonacci(6))],
    ]).endState();
    expect(
      Object.values(end.codes!)
        .map((c) => c.length)
        .sort(),
    ).toEqual([1, 2, 3, 4, 5, 5]);
    // Equal counts of a power of two symbols: every code has the same length.
    const flat = new Timeline(huffman, huffman.defaults, 1, [
      ['build', pairs([5, 5, 5, 5])],
    ]).endState();
    expect(new Set(Object.values(flat.codes!).map((c) => c.length))).toEqual(new Set([2]));
  });
});

describe('huffman practice', () => {
  const kinds = huffman.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual(['code-of', 'total-bits', 'next-merge', 'decode']);
  });

  it('gets every answer right, checked against the reference Huffman', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const settings = { ...huffman.defaults, ...q.settings } as HuffSettings;
        const src = readSource(q.setup[0]![1]);
        if (src instanceof Error) throw src;
        const ref = refBuild(src.freq, settings.ties);
        const a = q.answer;
        if (k.id === 'code-of') {
          const sym = /`(.)`\? Type/.exec(q.prompt)![1]!;
          expect(a).toEqual({ kind: 'sequence', value: [ref.codes[sym]] });
        } else if (k.id === 'total-bits') {
          expect(a).toEqual({ kind: 'number', value: ref.cost });
        } else if (k.id === 'next-merge') {
          if (a.kind !== 'choice') throw new Error('next-merge is a choice');
          // Replay the setup's merges on the reference list, then take the next two.
          const merged = refBuild(src.freq, settings.ties, q.setup.length - 1).queue;
          expect(a.options[a.correct]).toBe(`${refName(merged[0]!)} and ${refName(merged[1]!)}`);
        } else {
          const bits = String(q.watch![0]![1]);
          const byCode = new Map(Object.entries(ref.codes).map(([sym, c]) => [c, sym]));
          let out = '';
          let cur = '';
          for (const b of bits) {
            cur += b;
            if (byCode.has(cur)) {
              out += byCode.get(cur);
              cur = '';
            }
          }
          expect(cur).toBe('');
          expect(a).toEqual({ kind: 'sequence', value: [out] });
        }
      }
    }
  });

  it('shows the answer by playing the asked operations after the setup', () => {
    for (const k of kinds) {
      for (let seed = 1; seed <= 5; seed++) {
        const q = k.make(makeRng(seed));
        const settings = { ...huffman.defaults, ...q.settings } as HuffSettings;
        const t = new Timeline(huffman, settings, 1, [...q.setup, ...q.watch!]);
        expect(t.entries).toHaveLength(q.setup.length + q.watch!.length);
        expect(q.watch!.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('drawn text size', () => {
  // The table's headers were 12 units (10.3 px on a laptop): now 13.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(huffman, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(huffman, PHONE_STAGE).px).toBeGreaterThanOrEqual(11);
  });
});
