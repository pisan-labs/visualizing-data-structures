import { describe, expect, it } from 'vitest';
import { emptyProgress, type Progress } from '../progress/progress';
import { parseLocation, vizHref } from '../ui/route';
import { vizzes } from '../viz/all';
import { findPath, pathProgress, paths, pathSteps, stepOf, vizTitle, type PathDef } from './paths';

const byId = new Map(vizzes.map((d) => [d.id, d]));

describe('learning paths', () => {
  it('have unique ids that are safe in an address', () => {
    const ids = paths.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  for (const path of paths) {
    describe(path.id, () => {
      const steps = pathSteps(path);

      it('has text everywhere, without em dashes or placeholders', () => {
        const texts = [path.title, path.audience, path.blurb, path.intro];
        texts.push(...path.stages.map((s) => s.title), ...steps.map((s) => s.note));
        for (const t of texts) {
          expect(t.trim().length).toBeGreaterThan(2);
          expect(t).not.toMatch(/—|\bTODO\b|\bTBD\b|undefined/);
        }
        expect(path.stages.every((s) => s.steps.length > 0)).toBe(true);
      });

      it('steps on live pages, each page once, in 8 to 25 steps', () => {
        for (const s of steps) expect(byId.has(s.viz), s.viz).toBe(true);
        expect(new Set(steps.map((s) => s.viz)).size).toBe(steps.length);
        expect(steps.length).toBeGreaterThanOrEqual(8);
        expect(steps.length).toBeLessThanOrEqual(25);
      });

      it('states its own number of steps, if it states one', () => {
        for (const [, n] of path.blurb.matchAll(
          /\b(\d+|Ten) (?:of the most watchable )?(?:pages|steps|small pictures)\b/g,
        ))
          expect(n === 'Ten' ? 10 : Number(n)).toBe(steps.length);
      });

      it('suggests examples the pages have', () => {
        for (const s of steps.filter((x) => x.example)) {
          const ids = byId.get(s.viz)!.examples.map((e) => e.id);
          expect(ids, `${s.viz}: ${s.example}`).toContain(s.example);
        }
      });

      it('names every step by its catalog title', () => {
        for (const s of steps) expect(vizTitle(s.viz)).not.toBe(s.viz);
      });
    });
  }
});

describe('pathProgress', () => {
  const path: PathDef = {
    id: 'test',
    title: 'Test',
    audience: 'Tests',
    blurb: 'A path for tests.',
    intro: 'A path for tests.',
    stages: [
      { title: 'One', steps: [{ viz: 'a', note: 'a' }] },
      {
        title: 'Two',
        steps: [
          { viz: 'b', note: 'b' },
          { viz: 'c', note: 'c' },
        ],
      },
    ],
  };
  const at = '2026-11-15T00:00:00.000Z';
  const finished = (lessons: string[]) => ({
    lessons: Object.fromEntries(lessons.map((l) => [l, { done: true, at }])),
    checks: {},
    practice: {},
    outline: { lessons, checks: [], at },
  });

  it('starts at zero with the first step next', () => {
    const s = pathProgress(emptyProgress(), path);
    expect(s).toMatchObject({ total: 3, finished: 0, started: 0, percent: 0 });
    expect(s.next?.n).toBe(1);
  });

  it('counts finished pages, rounds down, and points at the first one not finished', () => {
    const p: Progress = {
      ...emptyProgress(),
      pages: {
        a: finished(['x', 'y']),
        c: finished(['z']),
        b: { ...finished(['x', 'y']), lessons: { x: { done: true, at } } },
      },
    };
    const s = pathProgress(p, path);
    expect(s).toMatchObject({ finished: 2, started: 3, percent: 66 });
    expect(s.next?.step.viz).toBe('b');
    expect(s.next?.n).toBe(2);
  });

  it('reaches 100 with nothing next', () => {
    const p: Progress = {
      ...emptyProgress(),
      pages: { a: finished(['x']), b: finished(['x']), c: finished(['x']) },
    };
    expect(pathProgress(p, path)).toMatchObject({ percent: 100, next: undefined });
  });

  it('finds a step by page', () => {
    expect(stepOf(path, 'c')).toMatchObject({ n: 3, step: { viz: 'c' } });
    expect(stepOf(path, 'nope')).toBeUndefined();
  });
});

describe('path addresses', () => {
  it('parses /path/<id>/ as a path page', () => {
    expect(parseLocation('/path/data-structures/', '')).toEqual({
      kind: 'path',
      id: 'data-structures',
      key: '/path/data-structures/',
    });
  });

  it('carries the path on a visualization page, but not inside a lesson list', () => {
    expect(vizHref('bst', { path: 'data-structures' })).toBe('/bst/#path=data-structures');
    expect(vizHref('bst', { path: 'data-structures', list: 'L', item: 2 })).toBe(
      '/bst/#list=L&item=2',
    );
    const r = parseLocation('/bst/', '#path=data-structures');
    expect(r.kind === 'viz' && r.path).toBe('data-structures');
  });

  it('knows each path by id', () => {
    for (const p of paths) expect(findPath(p.id)).toBe(p);
    expect(findPath('nope')).toBeUndefined();
  });
});
