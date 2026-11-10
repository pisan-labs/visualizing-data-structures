import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  attemptKey,
  checkId,
  emptyProgress,
  mergeProgress,
  pageSummary,
  parseProgress,
  reachLesson,
  recordAttempt,
  resetProgress,
  setCheckRight,
  setLesson,
  summaryText,
  withOutline,
  type Progress,
} from './progress';

const T0 = Date.parse('2026-11-10T09:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

// Few keys and few distinct times, so copies often touch the same item at the same moment.
const time = fc.integer({ min: 0, max: 12 }).map(at);
const key = fc.constantFrom('a', 'b', 'c');
const marks = fc.dictionary(key, fc.record({ done: fc.boolean(), at: time }), { maxKeys: 3 });
const attempts = fc.dictionary(key, fc.record({ right: fc.boolean(), at: time }), {
  maxKeys: 3,
});
const outline = fc.record({
  lessons: fc.subarray(['a', 'b', 'c']),
  checks: fc.subarray(['a', 'b']),
  at: time,
});
const page = fc.record(
  { lessons: marks, checks: marks, practice: attempts, outline },
  { requiredKeys: ['lessons', 'checks', 'practice'] },
);
const progress: fc.Arbitrary<Progress> = fc
  .record(
    {
      version: fc.constant(1 as const),
      resetAt: time,
      pages: fc.dictionary(fc.constantFrom('stack-array', 'bst', 'dfa'), page, { maxKeys: 3 }),
    },
    { requiredKeys: ['version', 'pages'] },
  )
  // As stored: through the parser, which also applies the copy's own reset.
  .map((p) => parseProgress(JSON.parse(JSON.stringify(p))));

describe('merging two copies of progress', () => {
  it('gives the same result in either order', () => {
    fc.assert(
      fc.property(progress, progress, (a, b) => {
        expect(mergeProgress(a, b)).toEqual(mergeProgress(b, a));
      }),
      { numRuns: 500 },
    );
  });

  it('gives the same result however three copies are grouped', () => {
    fc.assert(
      fc.property(progress, progress, progress, (a, b, c) => {
        expect(mergeProgress(mergeProgress(a, b), c)).toEqual(
          mergeProgress(a, mergeProgress(b, c)),
        );
      }),
      { numRuns: 500 },
    );
  });

  it('changes nothing when a copy meets itself or an empty copy', () => {
    fc.assert(
      fc.property(progress, (a) => {
        expect(mergeProgress(a, a)).toEqual(a);
        expect(mergeProgress(a, emptyProgress())).toEqual(a);
      }),
    );
  });

  it('keeps every item newer than the latest reset, with the right winner', () => {
    fc.assert(
      fc.property(progress, progress, (a, b) => {
        const m = mergeProgress(a, b);
        const t = (s?: string) => (s ? Date.parse(s) : -Infinity);
        const reset = Math.max(t(a.resetAt), t(b.resetAt));
        for (const copy of [a, b]) {
          for (const [id, p] of Object.entries(copy.pages)) {
            for (const kind of ['lessons', 'checks', 'practice'] as const) {
              for (const [k, item] of Object.entries(p[kind])) {
                if (Date.parse(item.at) <= reset) continue;
                // Each item keeps its latest record.
                const kept = m.pages[id]![kind][k]!;
                expect(Date.parse(kept.at)).toBeGreaterThanOrEqual(Date.parse(item.at));
              }
            }
          }
        }
        // And nothing from before the reset survives.
        for (const p of Object.values(m.pages)) {
          for (const item of [
            ...Object.values(p.lessons),
            ...Object.values(p.checks),
            ...Object.values(p.practice),
          ])
            expect(Date.parse(item.at)).toBeGreaterThan(reset);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('lets a later untick win over an earlier tick, and the reverse', () => {
    const ticked = setLesson(emptyProgress(), 'bst', 'idea', true, at(1));
    const unticked = setLesson(emptyProgress(), 'bst', 'idea', false, at(2));
    expect(mergeProgress(ticked, unticked).pages.bst!.lessons.idea).toEqual({
      done: false,
      at: at(2),
    });
    const again = setLesson(emptyProgress(), 'bst', 'idea', true, at(3));
    expect(mergeProgress(unticked, again).pages.bst!.lessons.idea!.done).toBe(true);
  });

  it('keeps the later of two first tries at a practice question', () => {
    const laptop = recordAttempt(emptyProgress(), 'bst', '123-1', false, at(1));
    const phone = recordAttempt(emptyProgress(), 'bst', '123-1', true, at(5));
    expect(mergeProgress(laptop, phone).pages.bst!.practice['123-1']).toEqual({
      right: true,
      at: at(5),
    });
    // At the same moment, the wrong answer.
    const same = recordAttempt(emptyProgress(), 'bst', '123-1', true, at(1));
    expect(mergeProgress(same, laptop).pages.bst!.practice['123-1']!.right).toBe(false);
  });

  it('removes from the other copy what a reset removed, but keeps what came after', () => {
    const laptop = setCheckRight(
      setLesson(emptyProgress(), 'bst', 'idea', true, at(1)),
      'dfa',
      'c1',
      at(2),
    );
    const phone = setLesson(resetProgress(at(3)), 'stack-array', 'try-this', true, at(4));
    const merged = mergeProgress(laptop, phone);
    expect(merged.resetAt).toBe(at(3));
    expect(Object.keys(merged.pages)).toEqual(['stack-array']);
  });
});

describe('reading stored progress', () => {
  it('drops what is malformed and reads another version as empty', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('x')).toEqual(emptyProgress());
    expect(parseProgress({ version: 2, pages: { bst: {} } })).toEqual(emptyProgress());
    const raw = {
      version: 1,
      pages: {
        bst: {
          lessons: {
            good: { done: true, at: '2026-11-10T09:00:00Z' },
            noTime: { done: true },
            badTime: { done: true, at: 'yesterday' },
            notBool: { done: 'yes', at: at(1) },
            'bad key!': { done: true, at: at(1) },
          },
          checks: [],
          practice: { '1-1': { right: false, at: at(2) } },
          outline: { lessons: ['good', 7], checks: [], at: at(0) },
        },
        '<script>': { lessons: {} },
      },
    };
    expect(parseProgress(raw)).toEqual({
      version: 1,
      pages: {
        bst: {
          lessons: { good: { done: true, at: '2026-11-10T09:00:00.000Z' } },
          checks: {},
          practice: { '1-1': { right: false, at: at(2) } },
          outline: { lessons: ['good'], checks: [], at: at(0) },
        },
      },
    });
  });

  it('round-trips through JSON', () => {
    fc.assert(
      fc.property(progress, (p) => {
        expect(parseProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
      }),
    );
  });
});

describe('recording progress', () => {
  it('marks a lesson read on reaching its end only if the reader has not marked it', () => {
    let p = reachLesson(emptyProgress(), 'bst', 'idea', at(1));
    expect(p.pages.bst!.lessons.idea).toEqual({ done: true, at: at(1) });
    p = setLesson(p, 'bst', 'idea', false, at(2));
    expect(reachLesson(p, 'bst', 'idea', at(3))).toBe(p);
  });

  it('counts only the first try at a question', () => {
    const p = recordAttempt(emptyProgress(), 'bst', attemptKey(42, 0), false, at(1));
    expect(recordAttempt(p, 'bst', '42-1', true, at(2))).toBe(p);
    expect(attemptKey(42, 0)).toBe('42-1');
  });

  it('keeps the outline time when the outline is the same', () => {
    const o = { lessons: ['a', 'b'], checks: ['c1'] };
    const p = withOutline(emptyProgress(), 'bst', o, at(1));
    expect(withOutline(p, 'bst', { ...o }, at(2))).toBe(p);
    expect(withOutline(p, 'bst', { ...o, lessons: ['a'] }, at(2)).pages.bst!.outline!.at).toBe(
      at(2),
    );
  });

  it('gives each check an id from its question', () => {
    expect(checkId('After push(1), push(2), what does pop() return?')).toMatch(/^c[0-9a-z]+$/);
    expect(checkId('a')).not.toBe(checkId('b'));
    expect(checkId('a')).toBe(checkId('a'));
  });
});

describe('summaries', () => {
  const o = { lessons: ['idea', 'cost', 'try-this'], checks: ['c1', 'c2'] };
  let p = withOutline(emptyProgress(), 'bst', o, at(0));
  p = setLesson(p, 'bst', 'idea', true, at(1));
  p = setLesson(p, 'bst', 'gone', true, at(1));
  p = setCheckRight(p, 'bst', 'c1', at(2));
  p = recordAttempt(p, 'bst', '5-1', true, at(3));
  p = recordAttempt(p, 'bst', '5-2', false, at(3));

  it('counts against the page as it is now', () => {
    const s = pageSummary(p, 'bst', o);
    expect(s).toMatchObject({
      lessonsRead: 1,
      lessonsTotal: 3,
      checksRight: 1,
      checksTotal: 2,
      practiceRight: 1,
      practiceTried: 2,
      started: true,
      finished: false,
    });
    expect(summaryText(s)).toBe(
      '1 of 3 lessons read, 1 of 2 checks right, practice 1 of 2 right on the first try',
    );
  });

  it('finishes a page when every lesson is read and every check is right', () => {
    let q = p;
    for (const l of o.lessons) q = setLesson(q, 'bst', l, true, at(4));
    expect(pageSummary(q, 'bst').finished).toBe(false);
    q = setCheckRight(q, 'bst', 'c2', at(5));
    expect(pageSummary(q, 'bst').finished).toBe(true);
  });

  it('is not started by an outline or an untick alone', () => {
    let q = withOutline(emptyProgress(), 'bst', o, at(0));
    q = setLesson(q, 'bst', 'idea', false, at(1));
    expect(pageSummary(q, 'bst').started).toBe(false);
    expect(pageSummary(q, 'nothing').started).toBe(false);
  });
});
