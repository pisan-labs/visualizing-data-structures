import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Step } from '../../engine/types';
import { binaryHeap, parseHeapInput } from '.';
import { CAPACITY, heightOf, type HeapExtra, type HeapSettings, type HeapState } from './model';

// ---------------------------------------------------------------------------------------------
// Reference: a plain array heap with the CLRS conventions, written independently. Positions are
// 0-based here; the model shows them from 0 or 1.

class RefHeap {
  a: number[] = [];
  swaps = 0;
  constructor(readonly max: boolean) {}

  private beats(x: number, y: number): boolean {
    return this.max ? x > y : x < y;
  }

  private swap(i: number, j: number): void {
    [this.a[i], this.a[j]] = [this.a[j]!, this.a[i]!];
    this.swaps += 1;
  }

  up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.beats(this.a[i]!, this.a[p]!)) return;
      this.swap(i, p);
      i = p;
    }
  }

  down(i: number): void {
    const n = this.a.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let b = i;
      if (l < n && this.beats(this.a[l]!, this.a[b]!)) b = l;
      if (r < n && this.beats(this.a[r]!, this.a[b]!)) b = r;
      if (b === i) return;
      this.swap(i, b);
      i = b;
    }
  }

  insert(k: number): boolean {
    if (this.a.length >= CAPACITY) return false;
    this.a.push(k);
    this.up(this.a.length - 1);
    return true;
  }

  extract(): number | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0]!;
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      this.down(0);
    }
    return top;
  }

  build(keys: number[], method: HeapSettings['build']): void {
    this.a = [];
    if (method === 'insert') for (const k of keys) this.insert(k);
    else {
      this.a = [...keys];
      for (let i = Math.floor(keys.length / 2) - 1; i >= 0; i--) this.down(i);
    }
  }

  update(p: number, k: number): boolean {
    if (p < 0 || p >= this.a.length) return false;
    const old = this.a[p]!;
    this.a[p] = k;
    if (this.beats(k, old)) this.up(p);
    else if (this.beats(old, k)) this.down(p);
    return true;
  }

  delete(p: number): number | undefined {
    if (p < 0 || p >= this.a.length) return undefined;
    const old = this.a[p]!;
    const last = this.a.pop()!;
    if (p < this.a.length) {
      this.a[p] = last;
      if (this.beats(last, old)) this.up(p);
      else if (this.beats(old, last)) this.down(p);
    }
    return old;
  }
}

// ---------------------------------------------------------------------------------------------
// Invariants every step must keep.

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const keysOf = (s: HeapState) => s.items.map((x) => x.key);

/** Parent-child pairs (0-based positions) where the heap order is broken. */
function violations(s: HeapState, max: boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let p = 1; p < s.items.length; p++) {
    const q = (p - 1) >> 1;
    const a = s.items[q]!.key;
    const b = s.items[p]!.key;
    if (max ? a < b : a > b) out.push([q, p]);
  }
  return out;
}

function checkStep(step: Step<HeapState, HeapExtra>, max: boolean) {
  const s = step.state;
  const uids = s.items.map((x) => x.uid);
  expect(new Set(uids).size, 'every key has its own uid').toBe(uids.length);
  for (const u of uids) expect(u).toBeLessThan(s.nextUid);
  expect(s.items.length).toBeLessThanOrEqual(CAPACITY);
  // The array is the shape: n slots in a row make a complete tree. The readouts agree.
  expect(step.vars?.N).toBe(s.items.length);
  expect(step.vars?.height).toBe(heightOf(s.items.length));
  // Heap order holds everywhere except next to the key being sifted, and (during a bottom-up
  // build) above the slots not yet sifted down.
  const { focus, todo = 0 } = step.extra ?? {};
  for (const [q, p] of violations(s, max)) {
    expect(q < todo || q === focus || p === focus, `order broken at ${q}-${p}: ${step.say}`).toBe(
      true,
    );
  }
}

const settingsArb = fc.record({
  order: fc.constantFrom('max' as const, 'min' as const),
  index: fc.constantFrom('one' as const, 'zero' as const),
  build: fc.constantFrom('bottom-up' as const, 'insert' as const),
});

const keyArb = fc.integer({ min: 1, max: 40 });
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  { weight: 8, arbitrary: keyArb.map((k) => ['insert', k] as OpCall) },
  { weight: 4, arbitrary: fc.constant(['extract'] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['peek'] as OpCall) },
  {
    weight: 2,
    arbitrary: fc
      .array(keyArb, { minLength: 1, maxLength: 16 })
      .map((ks) => ['build', ks.join(' ')] as OpCall),
  },
  {
    weight: 3,
    arbitrary: fc
      .tuple(fc.integer({ min: -1, max: 12 }), keyArb)
      .map(([i, k]) => ['update', i, k] as OpCall),
  },
  { weight: 2, arbitrary: fc.integer({ min: -1, max: 12 }).map((i) => ['delete', i] as OpCall) },
  { weight: 1, arbitrary: fc.constant(['clear'] as OpCall) },
);

const run = (calls: OpCall[], s: Partial<HeapSettings> = {}) =>
  new Timeline(binaryHeap, { ...binaryHeap.defaults, ...s } as HeapSettings, 1, calls);

describe('binary heap', () => {
  it('matches a reference heap, slot for slot, and keeps the invariants on every step', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 40 }), (settings, calls) => {
        const st = settings as HeapSettings;
        const max = st.order === 'max';
        const base = st.index === 'one' ? 1 : 0;
        const t = new Timeline(binaryHeap, st, 1, calls);
        const ref = new RefHeap(max);
        let before = keysOf(t.initial.state);
        calls.forEach((call, k) => {
          const [op, a, b] = call;
          const entry = t.entries[k]!;
          const last = entry.steps.at(-1)!;
          const v = last.vars ?? {};
          let list: number[] = [];
          switch (op) {
            case 'insert':
              if (!ref.insert(Number(a))) expect(last.lines).toContain('ins.overflow');
              break;
            case 'extract':
              expect(v.returned).toBe(ref.extract());
              break;
            case 'peek':
              expect(v.returned).toBe(ref.a[0]);
              break;
            case 'build':
              list = String(a).split(' ').map(Number);
              ref.build(list, st.build);
              break;
            case 'update':
              ref.update(Number(a) - base, Number(b));
              break;
            case 'delete':
              expect(v.returned).toBe(ref.delete(Number(a) - base));
              break;
            case 'clear':
              ref.a = [];
              break;
          }
          const after = keysOf(entry.end);
          expect(after, `array after ${call.join(' ')}`).toEqual(ref.a);
          expect(violations(entry.end, max), 'a heap after every operation').toEqual([]);
          let cmp = 0;
          let swp = 0;
          for (const step of entry.steps) {
            checkStep(step, max);
            const keys = sorted(keysOf(step.state));
            if (op === 'build' && st.build === 'insert') {
              // Repeated insertion: the keys so far are a prefix of the list.
              expect(keys).toEqual(sorted(list.slice(0, keys.length)));
            } else if (op === 'build') {
              expect(keys).toEqual(sorted(list));
            } else {
              expect([sorted(before), sorted(after)]).toContainEqual(keys);
            }
            const c = Number(step.vars?.comparisons);
            const w = Number(step.vars?.swaps);
            expect(c).toBeGreaterThanOrEqual(cmp);
            expect(w).toBeGreaterThanOrEqual(swp);
            cmp = c;
            swp = w;
          }
          const prevEnd = k === 0 ? t.initial.state : t.entries[k - 1]!.end;
          if (op === 'peek') expect(entry.end, 'peek changes nothing').toEqual(prevEnd);
          before = after;
        });
      }),
      { numRuns: 300 },
    );
  });

  it('builds bottom-up with fewer than n swaps and 2n comparisons', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 99 }), { minLength: 1, maxLength: CAPACITY }),
        (keys) => {
          for (const order of ['max', 'min'] as const) {
            const t = run([['build', keys.join(' ')]], { order });
            const v = t.entries[0]!.steps.at(-1)!.vars!;
            expect(Number(v.swaps)).toBeLessThan(keys.length);
            expect(Number(v.comparisons)).toBeLessThan(2 * keys.length);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('shows the gap between the two build methods on ascending input', () => {
    const list = Array.from({ length: 15 }, (_, i) => i + 1).join(' ');
    const counts = (build: HeapSettings['build']): [number, number] => {
      const v = run([['build', list]], { build }).entries[0]!.steps.at(-1)!.vars!;
      return [Number(v.comparisons), Number(v.swaps)];
    };
    const [c1, s1] = counts('bottom-up');
    const [c2, s2] = counts('insert');
    expect(s1).toBeLessThan(s2);
    expect(c1).toBeLessThan(c2);
    // Ascending keys are the worst case for insertion: each new key climbs to the root.
    expect(s2).toBe(
      [...Array(15).keys()].reduce((sum, i) => sum + Math.floor(Math.log2(i + 1)), 0),
    );
  });

  it('moves a value with one identity, in the tree and the array', () => {
    const t = run([
      ['build', '50 30 40 10 20'],
      ['insert', 60],
    ]);
    const steps = t.entries[1]!.steps;
    const uid = steps[0]!.state.items.at(-1)!.uid;
    const end = steps.at(-1)!.state;
    expect(end.items[0]!.uid).toBe(uid);
    const scene = binaryHeap.view(steps.at(-1)!, binaryHeap.defaults);
    const ids = scene.shapes.map((s) => s.id);
    expect(ids).toContain(`node-${uid}`);
    expect(ids).toContain(`aval-${uid}`);
    // A highlight on the value colors its circle and its array cell alike.
    const marked = binaryHeap.view(
      { ...steps.at(-1)!, marks: [{ id: `node-${uid}`, role: 'found' }] },
      binaryHeap.defaults,
    );
    const role = (id: string) => marked.shapes.find((s) => s.id === id)?.role;
    expect(role(`node-${uid}`)).toBe('found');
    expect(role(`aval-${uid}`)).toBe('found');
    expect(role('cell-0')).toBe('found');
  });

  it('follows the indexing setting in the narration, the pseudocode and the labels', () => {
    const one = run(
      [
        ['build', '10 20 30 40'],
        ['insert', 50],
      ],
      { index: 'one' },
    );
    const zero = run(
      [
        ['build', '10 20 30 40'],
        ['insert', 50],
      ],
      { index: 'zero' },
    );
    const says = (t: typeof one) => t.entries[1]!.steps.map((s) => s.say).join(' ');
    expect(says(one)).toContain('parent(5) = ⌊5/2⌋ = 2');
    expect(says(zero)).toContain('parent(4) = ⌊(4 − 1)/2⌋ = 1');
    const code = (s: Partial<HeapSettings>) =>
      binaryHeap
        .pseudocode({ ...binaryHeap.defaults, ...s } as HeapSettings)
        .flatMap((b) => b.lines.map((l) => l.text))
        .join('\n');
    expect(code({ index: 'one' })).toContain('for i = ⌊n/2⌋ downto 1');
    expect(code({ index: 'zero' })).toContain('for i = ⌊n/2⌋ − 1 downto 0');
    expect(code({ order: 'min' })).toContain('minHeapify(i)');
    expect(code({ order: 'min' })).toContain('extractMin()');
    expect(code({ build: 'insert' })).toContain('for each key in list');
    const labels = (t: typeof one) =>
      binaryHeap
        .view(t.entries[1]!.steps.at(-1)!, t.settings)
        .shapes.filter((s) => s.id.startsWith('aidx-'))
        .map((s) => (s.kind === 'text' ? s.text : ''));
    expect(labels(one)).toEqual(['1', '2', '3', '4', '5']);
    expect(labels(zero)).toEqual(['0', '1', '2', '3', '4']);
  });

  it('refuses what it cannot do, with a reason, and leaves the heap alone', () => {
    const full = Array.from({ length: CAPACITY }, (_, i) => i + 1).join(' ');
    const t = run([
      ['build', full],
      ['insert', 5],
      ['update', 40, 3],
      ['delete', 0],
      ['insert', 'cat'],
      ['build', 'zebra'],
    ]);
    for (const e of t.entries.slice(1)) {
      expect(e.end).toEqual(t.entries[0]!.end);
      expect(e.steps.at(-1)!.marks.some((m) => m.role === 'error')).toBe(true);
    }
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('Heap overflow');
    const empty = run([['extract'], ['peek']]);
    expect(empty.entries[0]!.steps.at(-1)!.say).toContain('Heap underflow');
    expect(empty.entries[1]!.steps.at(-1)!.vars?.returned).toBeUndefined();
  });

  it('parses keys and lists from the input box', () => {
    expect(parseHeapInput('42')).toBe(42);
    expect(parseHeapInput('-7')).toBe(-7);
    expect(parseHeapInput('5 3, 8 1')).toBe('5 3 8 1');
    expect(parseHeapInput('cat')).toBeInstanceOf(Error);
    expect(parseHeapInput('1000')).toBeInstanceOf(Error);
    expect(parseHeapInput('1 2 x')).toBeInstanceOf(Error);
    expect(
      parseHeapInput(
        Array(CAPACITY + 1)
          .fill('1')
          .join(' '),
      ),
    ).toBeInstanceOf(Error);
  });

  it('offers presets that build what they promise', () => {
    const presets = binaryHeap.controls.presets!;
    const make = (label: string) =>
      presets.find((p) => p.label.startsWith(label))!.make(makeRng(5), 10);
    const list = (calls: OpCall[]) => String(calls[0]![1]).split(' ').map(Number);
    expect(list(make('Ascending'))).toEqual(sorted(list(make('Ascending'))));
    expect(list(make('Descending'))).toEqual(sorted(list(make('Descending'))).reverse());
    expect(new Set(list(make('Many duplicates'))).size).toBeLessThanOrEqual(4);
    expect(make('Random, one insert')).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------------------------

describe('binary heap practice', () => {
  const kinds = binaryHeap.practice!;

  it('offers four kinds of question', () => {
    expect(kinds.map((k) => k.id)).toEqual([
      'insert-index',
      'extract-array',
      'build-swaps',
      'update-direction',
    ]);
  });

  it('gets every answer right, checked against the reference heap', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const k of kinds) {
        const q = k.make(makeRng(seed));
        const st = { ...binaryHeap.defaults, ...q.settings } as HeapSettings;
        const base = st.index === 'one' ? 1 : 0;
        const ref = new RefHeap(st.order === 'max');
        const [, list] = q.setup[0]!;
        const keys = String(list).split(' ').map(Number);
        const a = q.answer;
        const [op, x, y] = q.watch![0]!;
        ref.build(keys, 'bottom-up');
        if (k.id === 'build-swaps') {
          expect(op).toBe('build');
          expect(a).toEqual({ kind: 'number', value: ref.swaps });
          continue;
        }
        if (k.id === 'insert-index') {
          ref.insert(Number(x));
          expect(op).toBe('insert');
          expect(a).toEqual({ kind: 'number', value: ref.a.indexOf(Number(x)) + base });
        } else if (k.id === 'extract-array') {
          ref.extract();
          expect(a).toEqual({ kind: 'sequence', value: ref.a.map(String) });
        } else {
          const p = Number(x) - base;
          expect(q.prompt, 'the prompt names the key being replaced').toContain(
            `from ${ref.a[p]} to ${Number(y)}`,
          );
          ref.update(p, Number(y));
          const at = ref.a.indexOf(Number(y));
          if (a.kind !== 'choice') throw new Error('update-direction is a choice');
          const want = at < p ? 'Up' : at > p ? 'Down' : 'Nowhere';
          expect(
            a.options[a.correct]!.startsWith(want),
            `${q.prompt} ${a.options[a.correct]}`,
          ).toBe(true);
        }
      }
    }
  });

  it('shows the answer by playing the asked operation after the setup', () => {
    for (const k of kinds) {
      for (let seed = 1; seed <= 5; seed++) {
        const q = k.make(makeRng(seed));
        const st = { ...binaryHeap.defaults, ...q.settings } as HeapSettings;
        const t = new Timeline(binaryHeap, st, 1, [...q.setup, ...q.watch!]);
        expect(t.entries).toHaveLength(q.setup.length + q.watch!.length);
      }
    }
  });
});
