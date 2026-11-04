import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Value } from '../../engine/types';
import { dynamicArray, parseDynValue } from '.';
import { grownCapacity, items, MAX_CAPACITY, type DynSettings, type DynState } from './model';
import { view } from './view';

const settings = (s: Partial<DynSettings> = {}): DynSettings =>
  ({ ...dynamicArray.defaults, ...s }) as DynSettings;

const run = (st: DynSettings, calls: OpCall[]) => new Timeline(dynamicArray, st, 1, calls);
const lastStep = (t: ReturnType<typeof run>, k: number) => t.entries[k]!.steps.at(-1)!;
const appends = (n: number): OpCall[] => Array.from({ length: n }, (_, i) => ['append', i + 1]);

/** A plain reference: a JS array plus the capacity and copy bookkeeping the page promises. */
class Reference {
  items: Value[] = [];
  copies = 0;
  appends = 0;
  constructor(
    public capacity: number,
    private st: DynSettings,
  ) {}

  private resize(c: number) {
    this.copies += this.items.length;
    this.capacity = c;
  }

  /** false if the page refuses to draw an array that big. */
  private room(): boolean {
    if (this.items.length < this.capacity) return true;
    const c = grownCapacity(this.capacity, this.st);
    if (c > MAX_CAPACITY) return false;
    this.resize(c);
    return true;
  }

  private shrink() {
    if (this.st.shrink === 'never') return;
    const d = this.st.shrink === 'quarter' ? 4 : 2;
    const n = this.items.length;
    if (n > 0 && n === Math.floor(this.capacity / d)) this.resize(Math.floor(this.capacity / 2));
  }

  apply([op, a, b]: OpCall): Value | 'error' | 'empty' | 'refused' | undefined {
    const n = this.items.length;
    const index = (max: number) =>
      typeof a === 'number' && Number.isInteger(a) && a >= 0 && a <= max;
    switch (op) {
      case 'append':
        if (!this.room()) return 'refused';
        this.items.push(a!);
        this.appends++;
        return undefined;
      case 'insert':
        if (!index(n)) return 'error';
        if (!this.room()) return 'refused';
        this.items.splice(a as number, 0, b!);
        return undefined;
      case 'removeAt': {
        if (!index(n - 1)) return 'error';
        const [x] = this.items.splice(a as number, 1);
        this.shrink();
        return x;
      }
      case 'removeLast': {
        if (n === 0) return 'empty';
        const x = this.items.pop()!;
        this.shrink();
        return x;
      }
      case 'get':
        return index(n - 1) ? this.items[a as number] : 'error';
      case 'set':
        if (!index(n - 1)) return 'error';
        this.items[a as number] = b!;
        return undefined;
    }
    throw new Error(op);
  }
}

describe('dynamic array', () => {
  it('doubles when full and counts the copies', () => {
    const t = run(settings(), appends(9));
    expect(t.entries.map((e) => e.end.capacity)).toEqual([1, 2, 4, 4, 8, 8, 8, 8, 16]);
    const s = t.endState();
    expect(s.copies).toBe(15);
    expect(lastStep(t, 8).vars?.['copies/append']).toBe(1.67);
    expect(lastStep(t, 8).say).toContain('So far 9 appends have cost 15 copies, 1.67 per append.');
  });

  it('grows by 1.5, rounding up', () => {
    const t = run(settings({ growth: '1.5' }), appends(12));
    expect([...new Set(t.entries.map((e) => e.end.capacity))]).toEqual([1, 2, 3, 5, 8, 12]);
    expect(t.endState().copies).toBe(19);
  });

  it('animates every copy into the new array, one at a time in fine detail', () => {
    const t = run(settings({ start: 4 }), appends(5));
    const steps = t.entries[4]!.steps;
    const copies = steps.filter((s) => s.lines.includes('resize.copy'));
    expect(copies.map((s) => s.extra?.copied)).toEqual([1, 2, 3, 4]);
    expect(copies.map((s) => s.level)).toEqual([3, 3, 3, 2]);
    expect(steps.find((s) => s.lines.includes('resize.alloc'))!.extra?.next?.capacity).toBe(8);
    const swap = steps.find((s) => s.lines.includes('resize.swap'))!;
    expect(swap.state.gen).toBe(2);
    expect(swap.state.capacity).toBe(8);
  });

  it('shrinks at a quarter full, and thrashes at half full', () => {
    const shrink = run(settings(), [...appends(5), ['removeLast'], ['removeLast'], ['removeLast']]);
    expect(shrink.entries.map((e) => e.end.capacity).slice(4)).toEqual([8, 8, 8, 4]);
    const thrash = run(settings({ shrink: 'half', start: 4 }), [
      ...appends(5),
      ['removeLast'],
      ['append', 5],
      ['removeLast'],
    ]);
    expect(thrash.entries.map((e) => e.end.capacity).slice(4)).toEqual([8, 4, 8, 4]);
    expect(thrash.endState().copies).toBe(16);
  });

  it('shifts on insert and remove, and refuses bad indices', () => {
    const t = run(settings({ start: 8 }), [
      ...appends(4),
      ['insert', 0, 9],
      ['removeAt', 2],
      ['get', 4],
      ['insert', 'A', 1],
      ['set', 1.5, 1],
    ]);
    expect(items(t.endState())).toEqual([9, 1, 3, 4]);
    expect(t.endState().shifts).toBe(4 + 2);
    expect(lastStep(t, 5).vars?.returned).toBe(2);
    for (const k of [6, 7, 8]) expect(lastStep(t, k).lines[0]).toMatch(/\.error$/);
  });

  it('stops at the largest array the page draws', () => {
    const calls = appends(MAX_CAPACITY + 1);
    const t = run(settings(), calls);
    expect(t.endState().size).toBe(MAX_CAPACITY);
    expect(lastStep(t, MAX_CAPACITY).lines).toEqual(['append.grow']);
    const script = dynamicArray.code!.script(calls, settings());
    expect(script.input).not.toContain(`append ${MAX_CAPACITY + 1}`);
    expect(script.expected.at(-1)).toBe(String(MAX_CAPACITY));
  });

  it('matches a reference array, with invariants on every step', () => {
    const value = fc.oneof(fc.integer({ min: -2, max: 18 }), fc.constantFrom('A', 'cat', 2.5));
    const call = fc.oneof(
      { weight: 4, arbitrary: value.map((v) => ['append', v] as OpCall) },
      fc.tuple(value, value).map(([i, x]) => ['insert', i, x] as OpCall),
      value.map((i) => ['removeAt', i] as OpCall),
      { weight: 2, arbitrary: fc.constant(['removeLast'] as OpCall) },
      value.map((i) => ['get', i] as OpCall),
      fc.tuple(value, value).map(([i, x]) => ['set', i, x] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom('2' as const, '1.5' as const),
        fc.constantFrom('quarter' as const, 'never' as const, 'half' as const),
        fc.integer({ min: 1, max: 8 }),
        fc.array(call, { maxLength: 40 }),
        (growth, shrink, start, calls) => {
          const st = settings({ growth, shrink, start });
          const t = run(st, calls);
          const ref = new Reference(start, st);
          calls.forEach((c, k) => {
            const want = ref.apply(c);
            const last = lastStep(t, k);
            if (want === 'error') expect(last.lines[0]).toMatch(/\.error$/);
            else if (want === 'empty') expect(last.lines).toEqual(['removeLast.empty']);
            else if (want === 'refused') expect(last.lines).toEqual([`${c[0]}.grow`]);
            else expect(last.vars?.returned).toBe(want);
            const end = t.entries[k]!.end;
            expect(items(end)).toEqual(ref.items);
            expect(end.capacity).toBe(ref.capacity);
            expect(end.copies).toBe(ref.copies);
            expect(end.appends).toBe(ref.appends);
          });
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s: DynState = step.state;
            expect(s.capacity).toBeGreaterThanOrEqual(1);
            expect(s.capacity).toBeLessThanOrEqual(MAX_CAPACITY);
            expect(s.slots).toHaveLength(s.capacity);
            expect(s.size).toBeGreaterThanOrEqual(0);
            expect(s.size).toBeLessThanOrEqual(s.capacity);
            const live = step.extra?.live ?? s.size;
            for (let k = 0; k < live; k++) expect(s.slots[k]).not.toBeNull();
            expect(step.vars?.size).toBe(s.size);
            expect(step.vars?.capacity).toBe(s.capacity);
            expect(step.vars?.copies).toBe(s.copies);
            const next = step.extra?.next;
            if (next) {
              expect(next.slots).toHaveLength(next.capacity);
              expect(next.capacity).toBeLessThanOrEqual(MAX_CAPACITY);
              expect(next.capacity).toBeGreaterThanOrEqual(s.size);
              expect(step.extra?.copied ?? 0).toBeLessThanOrEqual(s.size);
            }
            const scene = view(step, st);
            const cells = scene.shapes.filter((sh) => /^a\d+-cell-/.test(sh.id));
            expect(cells).toHaveLength(s.capacity + (next?.capacity ?? 0));
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('checks capacity in the code tabs only for the settings the code follows', () => {
    const calls = appends(3);
    const plain = dynamicArray.code!.script(calls, settings());
    expect(plain.input).toEqual([
      'new 1',
      'append 1',
      'capacity',
      'append 2',
      'capacity',
      'append 3',
      'capacity',
    ]);
    expect(plain.expected).toEqual(['ok', '1', 'ok', '2', 'ok', '4']);
    const other = dynamicArray.code!.script(calls, settings({ growth: '1.5' }));
    expect(other.input).not.toContain('capacity');
  });

  it('parses input values', () => {
    expect(parseDynValue('42')).toBe(42);
    expect(parseDynValue('-1')).toBe(-1);
    expect(parseDynValue('x')).toBe('x');
    expect(parseDynValue('')).toBeInstanceOf(Error);
    expect(parseDynValue('1234567')).toBeInstanceOf(Error);
  });
});
