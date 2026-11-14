/**
 * The "spot it" practice kind: a short problem statement of our own, and the question "which
 * pattern fits?". A page keeps a small table of rows: problems for its own pattern, and a few
 * that look alike but call for another one (a sliding window beside prefix sums), so the
 * learner has to read the cue. Every statement is ours: never a LeetCode problem's name,
 * number or text.
 *
 *   spotItKind({ page: 'prefix-sum-hashmap', rows, watch: [['find', 7]] })
 *
 * Each question picks a row with the seeded RNG and offers its pattern's name with three wrong
 * options: the row's `near` patterns first (the confusable ones), then others drawn from
 * PATTERNS, never one in `alsoFits`. The explanation names the pattern and quotes the cue.
 * The picture is the state after `setup` (default: the page's start). "Show me" plays `watch`
 * only when the right pattern lives on this page; for the others there is nothing to play here.
 * Unknown pattern ids throw when the kind is made, so a typo fails the page's tests.
 */
import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind, Settings } from '../../engine/types';
import { pattern, PATTERNS } from './patterns';

export interface SpotRow {
  /** Our own problem statement, one or two sentences of inline Markdown. */
  problem: string;
  /** The id (in PATTERNS) of the pattern it calls for. */
  pattern: string;
  /** The words in the statement that give it away, quoted in the explanation. */
  cue: string | readonly string[];
  /** One or two sentences: why the cue calls for the pattern. */
  why: string;
  /** Patterns that look as if they fit but do not: the first wrong options. */
  near?: readonly string[];
  /** Patterns that would also solve it, never offered as wrong options. */
  alsoFits?: readonly string[];
}

export interface SpotItOptions {
  /** This page's id: "Show me" plays `watch` only for rows whose pattern lives here. */
  page: string;
  rows: readonly SpotRow[];
  /** Operations that make the picture. Default none: the page's start. */
  setup?: OpCall[];
  settings?: Settings;
  /** What "Show me" plays for a row whose pattern is this page's. */
  watch?: OpCall[];
  id?: string;
  title?: string;
}

/** How many options a question offers. */
const OPTIONS = 4;

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** “a” and “b”. */
function quote(cue: string | readonly string[]): string {
  const cues = (typeof cue === 'string' ? [cue] : [...cue]).map((c) => `“${c}”`);
  return cues.length > 1 ? `${cues.slice(0, -1).join(', ')} and ${cues[cues.length - 1]}` : cues[0]!;
}

export function spotItKind(o: SpotItOptions): PracticeKind {
  if (o.rows.length === 0) throw new Error('spotItKind needs at least one row.');
  for (const r of o.rows) {
    pattern(r.pattern);
    for (const id of [...(r.near ?? []), ...(r.alsoFits ?? [])]) pattern(id);
    if (r.alsoFits?.includes(r.pattern) || r.near?.includes(r.pattern))
      throw new Error(`Row "${r.problem}" lists its own pattern as another option.`);
    if (r.near?.some((id) => r.alsoFits?.includes(id)))
      throw new Error(`Row "${r.problem}" lists a pattern both as near and as also fitting.`);
  }
  return {
    id: o.id ?? 'spot-it',
    title: o.title ?? 'Spot the pattern',
    make(rng) {
      const row = o.rows[rng.int(0, o.rows.length - 1)]!;
      const right = pattern(row.pattern);
      const banned = new Set([right.id, ...(row.alsoFits ?? [])]);
      const near = shuffle(rng, row.near ?? []).slice(0, OPTIONS - 1);
      const taken = new Set([...banned, ...near]);
      const rest = shuffle(
        rng,
        PATTERNS.filter((p) => !taken.has(p.id)).map((p) => p.id),
      ).slice(0, OPTIONS - 1 - near.length);
      const options = shuffle(rng, [right.id, ...near, ...rest]).map((id) => pattern(id).name);
      const own = right.page === o.page && o.watch?.length;
      return {
        prompt: `Which pattern fits this problem? ${row.problem}`,
        setup: o.setup ?? [],
        ...(o.settings ? { settings: o.settings } : {}),
        answer: { kind: 'choice', options, correct: options.indexOf(right.name) },
        explain: `**${right.name}.** The cue is ${quote(row.cue)}. ${row.why}`,
        ...(own ? { watch: o.watch } : {}),
      };
    },
  };
}
