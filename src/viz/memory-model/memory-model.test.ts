import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { memoryModel, parseStatement } from '.';
import { mainText, readStmt, type MemSettings, type MemState } from './model';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';

const settings = (s: Partial<MemSettings> = {}): MemSettings =>
  ({ ...memoryModel.defaults, ...s }) as MemSettings;

const run = (...stmts: string[]): OpCall[] => stmts.map((s) => ['run', s]);
const main = (cs: OpCall[], s: Partial<MemSettings> = {}) =>
  mainText(new Timeline(memoryModel, settings(s), 1, cs).endState());

/**
 * Reference interpreters, written with the host language's own semantics: JavaScript arrays
 * are shared like Python lists, and C++ values are modeled by copying arrays on every
 * assignment and keeping references as a map from name to name.
 */
type Val = number | number[];

function refsRef(stmts: string[]): string[] {
  const env = new Map<string, Val>();
  const out: string[] = [];
  for (const raw of stmts) {
    const s = readStmt(raw);
    if (typeof s === 'string') continue;
    const get = (n: string) => env.get(n);
    let ok = true;
    switch (s.t) {
      case 'num':
        env.set(s.name, s.v);
        break;
      case 'list':
        env.set(s.name, [...s.items]);
        break;
      case 'copy':
        ok = env.has(s.from) && s.from !== s.name;
        if (ok) env.set(s.name, get(s.from)!);
        break;
      case 'append': {
        const l = get(s.name);
        ok = Array.isArray(l) && l.length < 8;
        if (ok) (l as number[]).push(s.v);
        break;
      }
      case 'set': {
        const l = get(s.name);
        ok = Array.isArray(l) && s.i < l.length;
        if (ok) (l as number[])[s.i] = s.v;
        break;
      }
      case 'call': {
        const a = get(s.arg);
        if (s.fn === 'grow') ok = Array.isArray(a) && a.length < 8;
        else if (s.fn === 'reset') ok = Array.isArray(a);
        else if (s.fn === 'bump') ok = typeof a === 'number';
        else ok = false;
        if (ok && s.fn === 'grow') (a as number[]).push(0);
        break;
      }
      default:
        ok = false;
    }
    if (ok) out.push(show(env));
  }
  return out;
}

function show(env: Map<string, Val>) {
  if (env.size === 0) return '(empty)';
  return [...env].map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(',')}]` : v}`).join(' ');
}

describe('memory model', () => {
  it('shares a list between two names in Python and Java', () => {
    expect(main(run('xs = [1, 2]', 'ys = xs', 'ys.append(3)'))).toBe('xs=[1,2,3] ys=[1,2,3]');
    expect(main(run('xs = [1, 2]', 'ys = xs', 'ys = [9]'))).toBe('xs=[1,2] ys=[9]');
  });

  it('copies the list in C++, and & makes another name', () => {
    const cpp = { lang: 'values' as const };
    expect(main(run('xs = [1, 2]', 'ys = xs', 'ys.append(3)'), cpp)).toBe('xs=[1,2] ys=[1,2,3]');
    expect(main(run('xs = [1, 2]', '&ys = xs', 'ys.append(3)'), cpp)).toBe('xs=[1,2,3] ys=[1,2,3]');
    expect(main(run('x = 5', '&r = x', 'r = 7'), cpp)).toBe('x=7 r=7');
  });

  it('passes a copy of the reference to functions', () => {
    expect(main(run('xs = [1]', 'grow(xs)', 'reset(xs)'))).toBe('xs=[1,0]');
    expect(main(run('n = 5', 'bump(n)'))).toBe('n=5');
    const cpp = { lang: 'values' as const };
    expect(main(run('xs = [1]', 'grow(xs)'), cpp)).toBe('xs=[1]');
    expect(main(run('xs = [1]', 'growRef(xs)', 'resetRef(xs)'), cpp)).toBe('xs=[0]');
    expect(main(run('n = 5', 'bumpRef(n)'), cpp)).toBe('n=6');
  });

  it('marks unreachable lists as garbage and frees them next', () => {
    const t = new Timeline(memoryModel, settings(), 1, run('xs = [1]', 'xs = [2]'));
    expect(t.endState().heap.map((o) => o.garbage)).toEqual([true, false]);
    const t2 = new Timeline(memoryModel, settings(), 1, run('xs = [1]', 'xs = [2]', 'y = 1'));
    expect(t2.endState().heap).toHaveLength(1);
  });

  it('turns down what the language cannot do', () => {
    const refused = (cs: OpCall[], s: Partial<MemSettings> = {}) =>
      new Timeline(memoryModel, settings(s), 1, cs).entries.at(-1)!.steps.at(-1)!.lines;
    expect(refused(run('x = 5', '&r = x'))).toEqual([]);
    expect(refused(run('xs = [1]', 'growRef(xs)'))).toEqual([]);
    expect(refused(run('x = 5', 'x = [1]'), { lang: 'values' })).toEqual([]);
    expect(refused(run('ys = xs'))).toEqual([]);
    expect(refused(run('xs = [1]', 'xs[3] = 1'))).toEqual([]);
  });

  it('matches a reference interpreter for any statements', () => {
    const name = fc.constantFrom('x', 'y', 'xs', 'ys', 'zs');
    const num = fc.integer({ min: -5, max: 20 });
    const stmt = fc.oneof(
      fc.tuple(name, num).map(([n, v]) => `${n} = ${v}`),
      fc.tuple(name, fc.array(num, { maxLength: 3 })).map(([n, vs]) => `${n} = [${vs.join(', ')}]`),
      fc.tuple(name, name).map(([a, b]) => `${a} = ${b}`),
      fc.tuple(name, num).map(([n, v]) => `${n}.append(${v})`),
      fc.tuple(name, fc.integer({ min: 0, max: 3 }), num).map(([n, i, v]) => `${n}[${i}] = ${v}`),
      fc.tuple(fc.constantFrom('grow', 'reset', 'bump'), name).map(([f, n]) => `${f}(${n})`),
    );
    fc.assert(
      fc.property(fc.array(stmt, { maxLength: 25 }), (stmts) => {
        const t = new Timeline(memoryModel, settings(), 1, run(...stmts));
        const got = t.entries
          .filter((e) => e.steps.at(-1)!.lines.length > 0)
          .map((e) => mainText(e.end));
        // The model also caps the heap; skip runs that reach the cap.
        const capped = t.entries.some((e) =>
          /keeps \d+ lists on the heap/.test(e.steps.at(-1)!.say),
        );
        if (!capped) expect(got).toEqual(refsRef(stmts));
        for (let i = 0; i < t.length; i++) checkInvariants(t.at(i).step.state);
      }),
      { numRuns: 300 },
    );
  });

  it('parses statements', () => {
    expect(parseStatement(' xs=[1,2] ')).toBe('xs = [1, 2]');
    expect(parseStatement('ys = xs;')).toBe('ys = xs');
    expect(parseStatement('&r = x')).toBe('&r = x');
    expect(parseStatement('print(x)')).toBeInstanceOf(Error);
    expect(parseStatement('x = 1000')).toBeInstanceOf(Error);
    expect(parseStatement('toolongname = 1')).toBeInstanceOf(Error);
  });
});

/** Every reference points at an object on the heap, and garbage really is unreachable. */
function checkInvariants(s: MemState) {
  const ids = new Set(s.heap.map((o) => o.id));
  const reached = new Set<number>();
  for (const f of s.frames)
    for (const v of f.vars)
      if (v.cell.kind === 'ref') {
        expect(ids.has(v.cell.obj)).toBe(true);
        reached.add(v.cell.obj);
      }
  for (const o of s.heap) if (o.garbage) expect(reached.has(o.id)).toBe(false);
  expect(s.frames[0]!.title).toBe('main');
}

describe('drawn text size', () => {
  // The heap's tags drew at 8.8 px on a phone; at 13, at 9.2.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(memoryModel, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(memoryModel, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
