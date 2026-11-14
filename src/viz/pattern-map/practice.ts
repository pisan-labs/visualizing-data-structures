/**
 * Practice for the pattern map. Every answer comes from running the model: which pattern a
 * problem ends on, which family a cue opens, which words were read as a cue. The pictures show
 * the overview, so the map does not give the answer away.
 *
 * This page keeps its own "spot it" kind rather than using spotItKind from the _patterns kit:
 * two of its problems are about concurrency, whose pages are not in PATTERNS, and "Show me"
 * here plays the reading of the problem on this page.
 */
import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import {
  CUES,
  FAMILIES,
  NODES,
  PROBLEMS,
  cue,
  familyOf,
  node,
  nodeLink,
  pageNote,
  type Problem,
} from './map';
import { defaults, shownFinds, type PmSettings, type PmState } from './model';

type Def = VizDef<PmState, PmSettings>;

const OPTIONS = 4;

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const which = (p: number): OpCall => ['which', String(p + 1)];
const pick = (text: string): OpCall => ['pick', text];

/** “a”, “b” and “c”. */
function quotes(xs: string[]): string {
  const q = xs.map((x) => `“${x}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}` : (q[0] ?? '');
}

/** What the reading of a problem found: its cues, its look-alikes, and why. */
function reading(p: Problem): string {
  const real = p.finds.filter((f) => !f.trap);
  const parts = [
    `${real.length > 1 ? 'The cues are' : 'The cue is'} ${quotes(real.map((f) => f.words))}: ${real
      .map((f) => `“${cue(f.cue).text}”`)
      .join(' and ')}.`,
    cue(real[0]!.cue).why,
  ];
  for (const f of p.finds.filter((f) => f.trap))
    parts.push(`“${f.words}” looks like a cue for ${node(cue(f.cue).node).name}, but ${f.but}.`);
  return parts.join(' ');
}

/**
 * The right option and up to three wrong ones, shuffled: taken from the first tier (the
 * look-alikes), then the next, never `banned` and never twice.
 */
function choices(
  rng: Rng,
  right: string,
  tiers: readonly (readonly string[])[],
  banned: ReadonlySet<string> = new Set(),
): string[] {
  const taken = new Set([right, ...banned]);
  const wrong: string[] = [];
  for (const tier of tiers)
    for (const x of shuffle(rng, tier))
      if (!taken.has(x) && wrong.length < OPTIONS - 1) {
        taken.add(x);
        wrong.push(x);
      }
  return shuffle(rng, [right, ...wrong]);
}

const ALL = NODES.map((n) => n.id);
const NAMES = FAMILIES.map((f) => f.name);

export function mapPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: PmSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);
  const end = (ops: OpCall[]) => run(ops).entries.at(-1)!.end;

  return [
    {
      id: 'spot-it',
      title: 'Spot the pattern',
      make(rng) {
        const p = rng.int(0, PROBLEMS.length - 1);
        const prob = PROBLEMS[p]!;
        const answer = end([which(p)]).node!;
        const banned = new Set(prob.alsoFits ?? []);
        const family = FAMILIES[familyOf(answer)]!.nodes;
        const ids = choices(rng, answer, [prob.near, family, ALL], banned);
        const options = ids.map((id) => node(id).name);
        return {
          prompt: `Which pattern fits this problem? ${prob.text}`,
          setup: [],
          answer: { kind: 'choice', options, correct: ids.indexOf(answer) },
          explain: `**${node(answer).name}.** ${reading(prob)} ${pageNote(answer)}`,
          watch: [which(p)],
        };
      },
    },
    {
      id: 'family',
      title: 'Which family?',
      make(rng) {
        if (rng.int(0, 1) === 0) {
          const p = rng.int(0, PROBLEMS.length - 1);
          const prob = PROBLEMS[p]!;
          const answer = end([which(p)]).node!;
          const f = familyOf(answer);
          const near = prob.near.map((id) => NAMES[familyOf(id)]!);
          const options = choices(rng, NAMES[f]!, [near, NAMES]);
          return {
            prompt: `Which family of the map would you look in for this problem? ${prob.text}`,
            setup: [],
            answer: { kind: 'choice', options, correct: options.indexOf(NAMES[f]!) },
            explain: `**${NAMES[f]}:** ${FAMILIES[f]!.about}. The problem calls for ${nodeLink(answer)}. ${reading(prob)}`,
            watch: [which(p)],
          };
        }
        const q = CUES[rng.int(0, CUES.length - 1)]!;
        const f = end([pick(q.text)]).family;
        const options = choices(rng, NAMES[f]!, [NAMES]);
        return {
          prompt: `A problem statement says “${q.text}”. Which family of the map does that cue send you to?`,
          setup: [],
          answer: { kind: 'choice', options, correct: options.indexOf(NAMES[f]!) },
          explain: `**${NAMES[f]}:** the cue points to ${nodeLink(q.node)}. ${q.why}`,
          watch: [pick(q.text)],
        };
      },
    },
    {
      id: 'cue',
      title: 'Which words give it away?',
      make(rng) {
        const p = rng.int(0, PROBLEMS.length - 1);
        const prob = PROBLEMS[p]!;
        // Run the reading, and take the words of the cues it followed to the answer.
        const t = run([which(p)]);
        const finds = shownFinds(prob, defaults);
        const hops = t.entries
          .at(-1)!
          .steps.filter((s) => s.lines.includes('which.hop') && !s.lines.includes('which.trap'))
          .map((s) => finds[s.state.hopped - 1]!);
        const right = hops[rng.int(0, hops.length - 1)]!;
        const traps = prob.finds.filter((f) => f.trap);
        const wrong = [...traps.map((f) => f.words), ...shuffle(rng, prob.filler)].slice(
          0,
          OPTIONS - 1,
        );
        const options = shuffle(rng, [right.words, ...wrong]);
        const answer = t.entries.at(-1)!.end.node!;
        const q = cue(right.cue);
        const trapSay = traps
          .map(
            (f) =>
              ` “${f.words}” only looks like a cue for ${node(cue(f.cue).node).name}: ${f.but}.`,
          )
          .join('');
        return {
          prompt: `Which words in this statement are a cue for the pattern it calls for? ${prob.text}`,
          setup: [],
          answer: { kind: 'choice', options, correct: options.indexOf(right.words) },
          explain: `**“${right.words}”** is the cue “${q.text}”, which points to ${nodeLink(answer)}. ${q.why}${trapSay} The other words set the scene and say nothing about the method.`,
          watch: [which(p)],
        };
      },
    },
    {
      id: 'follow',
      title: 'Follow a cue',
      make(rng) {
        const q = CUES[rng.int(0, CUES.length - 1)]!;
        const answer = end([pick(q.text)]).node!;
        const family = FAMILIES[familyOf(answer)]!.nodes;
        const ids = choices(rng, answer, [family, ALL]);
        const options = ids.map((id) => node(id).name);
        return {
          prompt: `Which pattern does the cue “${q.text}” point to?`,
          setup: [],
          answer: { kind: 'choice', options, correct: ids.indexOf(answer) },
          explain: `**${node(answer).name}.** ${q.why} ${pageNote(answer)}`,
          watch: [pick(q.text)],
        };
      },
    },
  ];
}
