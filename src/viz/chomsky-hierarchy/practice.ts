import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { LEVELS, parseRules, type Level } from '../_grammar/grammar';
import { LANGUAGE, LANGUAGES, TOOL_TEXT, type LangId, type Tool } from './languages';
import { NAME, productionText, ruleMiss, startOnRight, type RegionId } from './levels';
import { defaults, regionId, type ChExtra, type ChSettings, type ChState } from './model';

type Def = VizDef<ChState, ChSettings, ChExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const VARS = ['S', 'A', 'B'];
const terminals = (rng: Rng, lo: number, hi: number) =>
  Array.from({ length: rng.int(lo, hi) }, () => pick(rng, ['a', 'b'])).join('');

/** A right-linear right side: terminals, then at most one variable. */
const rightLinear = (rng: Rng) => {
  const v = rng.int(0, 2) ? pick(rng, VARS) : '';
  return terminals(rng, v ? 0 : 1, 2) + v;
};

/** Context-free right sides that are not right-linear. */
const NOT_RIGHT_LINEAR = ['aSb', 'SS', 'AB', 'Sa', 'aAbB', 'bAa', 'BA'];
/** Left sides with two symbols, and non-contracting right sides for them. */
const NOT_CONTEXT_FREE = [
  'AB -> BA',
  'aA -> aab',
  'Ab -> bA',
  'BA -> AB',
  'aB -> abb',
  'bA -> Aab',
];
/** Rules that shrink the string. */
const CONTRACTING = ['AB -> a', 'Ab -> b', 'BA -> eps', 'aA -> a', 'AB -> eps', 'bB -> b'];

const rule = (lhs: string, rhs: string) => `${lhs} -> ${rhs || 'eps'}`;

/**
 * A random grammar of `size` rules whose form lands on `level`: right-linear rules, plus one
 * rule that breaks each level inside the one asked for. Rules are distinct; the first is S's.
 */
export function randomGrammar(rng: Rng, level: Level, size: number): string {
  const n = Math.max(2, size);
  const rules: string[] = [];
  // A rule such as A -> A says nothing, so it is left out along with repeats.
  const add = (r: string) => {
    const [lhs, rhs] = r.split(' -> ');
    if (!rules.includes(r) && lhs !== rhs) rules.push(r);
  };
  const extra: string[] = [];
  if (level !== 'regular') extra.push(rule(pick(rng, VARS), pick(rng, NOT_RIGHT_LINEAR)));
  if (level === 'context-sensitive' || level === 'unrestricted')
    extra.push(pick(rng, NOT_CONTEXT_FREE));
  if (level === 'unrestricted') extra.push(pick(rng, CONTRACTING));
  // A context-sensitive grammar keeps every right side non-empty.
  const side = () => {
    const r = rightLinear(rng);
    return level === 'context-sensitive' && !r ? 'a' : r;
  };
  add(rule('S', side()));
  for (let guard = 0; rules.length < n - extra.length && guard < 50; guard++)
    add(rule(pick(rng, VARS), side()));
  for (const r of extra) rules.splice(rng.int(1, rules.length), 0, r);
  return [...new Set(rules)].join('; ');
}

const LEVEL_LABEL: Record<Level, string> = {
  regular: 'Regular (right-linear)',
  'context-free': 'Context-free',
  'context-sensitive': 'Context-sensitive',
  unrestricted: 'Unrestricted',
};

const REGION_LABEL: Record<RegionId, string> = {
  reg: 'Regular',
  cf: 'Context-free, not regular',
  cs: 'Context-sensitive, not context-free',
  dec: 'Decidable, not context-sensitive',
  re: 'Recursively enumerable, not decidable',
  all: 'Not recursively enumerable',
};

/** A grammar as the prompt shows it: one rule per item, with arrows and ε. */
const shown = (text: string) => text.replace(/->/g, '→').replace(/\beps\b/g, 'ε');

/**
 * Practice for the hierarchy page. Every answer comes from running the model. `def` is a getter
 * to avoid an import cycle.
 */
export function chomskyPractice(def: () => Def): PracticeKind[] {
  const run = (calls: OpCall[]) => new Timeline(def(), defaults, 1, calls);
  const classified = (text: string) => run([['classify', text]]).endState().grammar!;
  /** The region a placed language's last step marks as its home. */
  const placedIn = (id: LangId): RegionId => {
    const last = run([['place', id]]).entries[0]!.steps.at(-1)!;
    const m = last.marks.find((x) => x.id.startsWith('region-') && x.role === 'found')!;
    return (['reg', 'cf', 'cs', 'dec', 're', 'all'] as RegionId[]).find(
      (r) => regionId(r) === m.id,
    )!;
  };
  /** The argument the model gives for keeping a language out of the level inside. */
  const toolOf = (id: LangId): Tool => {
    const steps = run([['place', id]]).entries[0]!.steps;
    const out = steps.find((s) => s.lines.includes('place.out'))!;
    const f = out.state.focus;
    const k = f.kind === 'language' ? f.shown - 1 : 0;
    return LANGUAGE.get(id)!.claims[k]!.tool!;
  };
  /** Up to three wrong options from a pool, plus the right one, shuffled. */
  const choices = (rng: Rng, right: string, pool: readonly string[]) => {
    const others = shuffle(
      rng,
      pool.filter((o) => o !== right),
    ).slice(0, 3);
    const options = shuffle(rng, [right, ...others]);
    return { options, correct: options.indexOf(right) };
  };
  return [
    {
      id: 'grammar-level',
      title: 'Which level fits the rules?',
      make(rng) {
        const level = pick(rng, LEVELS);
        const text = randomGrammar(rng, level, rng.int(3, 5));
        const g = classified(text);
        const options = LEVELS.map((l) => LEVEL_LABEL[l]);
        const k = g.result.checks.length - 1;
        const below = k > 0 ? g.result.checks[k - 1]! : null;
        const why = below
          ? `${productionText(g.rules[below.miss]!)} rules out ${below.level}: ${below.why}. Every rule fits the ${g.result.level} form.`
          : 'Every rule is A → wB or A → w, so the grammar is right-linear.';
        return {
          prompt: `Classify the grammar \`${shown(text)}\`. What is the most restrictive level whose form every rule fits?`,
          setup: [],
          answer: { kind: 'choice', options, correct: LEVELS.indexOf(g.result.level) },
          explain: why,
          watch: [['classify', text]],
        };
      },
    },
    {
      id: 'breaking-rule',
      title: 'Which rule breaks the form?',
      make(rng) {
        const target: Level = rng.int(0, 1) ? 'regular' : 'context-free';
        // Keep only grammars where exactly one rule breaks the form, so the answer is clear.
        let text = '';
        for (let tries = 0; tries < 40; tries++) {
          text = randomGrammar(
            rng,
            target === 'regular' ? 'context-free' : 'context-sensitive',
            rng.int(3, 5),
          );
          const p = parseRules(text);
          if (p instanceof Error) continue;
          const onRight = startOnRight(p.start, p.rules);
          const bad = p.rules.filter((r) => ruleMiss(target, r, p.start, onRight));
          if (bad.length === 1) break;
        }
        const g = classified(text);
        const check = g.result.checks.find((c) => c.level === target)!;
        const texts = g.rules.map(productionText);
        const right = texts[check.miss]!;
        const { options, correct } = choices(rng, right, texts);
        const form =
          target === 'regular'
            ? 'right-linear (A → wB or A → w)'
            : 'context-free (one variable on the left)';
        return {
          prompt: `In \`${shown(text)}\`, one rule keeps the grammar from being ${form}. Which one?`,
          setup: [],
          answer: { kind: 'choice', options, correct },
          explain: `${right}: ${check.why}.`,
          watch: [['classify', text]],
        };
      },
    },
    {
      id: 'place',
      title: 'Where does the language go?',
      make(rng) {
        const lang = pick(rng, LANGUAGES);
        const region = placedIn(lang.id);
        const right = REGION_LABEL[region];
        const { options, correct } = choices(rng, right, Object.values(REGION_LABEL));
        const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
        const claims = lang.claims.map((c) => `${cap(c.short)}.`).join(' ');
        return {
          prompt: `${lang.title}. Where does it go on the map? Pick the innermost region it belongs to.`,
          setup: [],
          answer: { kind: 'choice', options, correct },
          explain: `${right}. ${claims}`,
          watch: [['place', lang.id]],
        };
      },
    },
    {
      id: 'argument',
      title: 'Which argument keeps it out?',
      make(rng) {
        const lang = pick(
          rng,
          LANGUAGES.filter((l) => l.claims.some((c) => c.kind === 'out')),
        );
        const tool = toolOf(lang.id);
        const out = lang.claims.find((c) => c.kind === 'out')!;
        const right = TOOL_TEXT[tool];
        // A reduction from A_TM rests on diagonalization, so the two never appear together.
        const sibling: Partial<Record<Tool, Tool>> = {
          reduction: 'diagonal',
          diagonal: 'reduction',
        };
        const pool = (Object.keys(TOOL_TEXT) as Tool[])
          .filter((t) => t !== sibling[tool])
          .map((t) => TOOL_TEXT[t]);
        const { options, correct } = choices(rng, right, pool);
        return {
          prompt: `${lang.title}. Which argument shows it is not ${NAME[out.region]}?`,
          setup: [],
          answer: { kind: 'choice', options, correct },
          explain: `${out.short.charAt(0).toUpperCase()}${out.short.slice(1)}.`,
          watch: [['place', lang.id]],
        };
      },
    },
  ];
}
