/**
 * Beam search (SLP3, on decoding): grow a tree of hypotheses one token at a time, keeping only
 * the best B by log-probability at each step. B = 1 is greedy decoding.
 *
 * The next-token model is a table made by hand: the probability of each word given the word
 * before it (a bigram model; a real model looks at the whole prefix, but beam search does not
 * care where the probabilities come from). It is built so that greedy, which takes the likeliest
 * first word "the", misses the likeliest sentence, which starts with "a".
 *
 *   score(h + w) = score(h) + ln P(w | last word of h)      (score(start) = 0)
 *
 * End of sequence (settings.eos)
 *   shrink  (SLP3) a hypothesis that ends with </s> leaves the beam, which narrows by one;
 *           search stops when the beam is empty
 *   refill  it is set aside if it ranks among the best B candidates, and the beam is refilled
 *           with the next best that have not ended; search stops once B have finished
 * Either way a hypothesis still going at the length limit is cut there and counts as finished.
 *
 * Length normalization (settings.norm): the final choice among the finished hypotheses compares
 * score / length (length = tokens generated, </s> included) instead of the raw score, which
 * favours short outputs (SLP3).
 *
 * Operations: search (from a start word, with B from the settings) and greedy (B = 1).
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { two } from '../_lm/numbers';

export const BOS = '<s>';
export const EOS = '</s>';

/** P(next | previous), each row in the order its children are tried; every row adds up to 1. */
export const TABLE: Readonly<Record<string, readonly (readonly [string, number])[]>> = {
  [BOS]: [
    ['the', 0.55],
    ['a', 0.45],
  ],
  the: [
    ['cat', 0.4],
    ['dog', 0.35],
    ['fox', 0.25],
  ],
  a: [
    ['dog', 0.85],
    ['cat', 0.15],
  ],
  cat: [
    ['sat', 0.5],
    ['ran', 0.3],
    [EOS, 0.2],
  ],
  dog: [
    ['ran', 0.45],
    [EOS, 0.35],
    ['sat', 0.2],
  ],
  fox: [
    ['ran', 0.9],
    [EOS, 0.1],
  ],
  sat: [
    [EOS, 0.7],
    ['down', 0.3],
  ],
  ran: [
    ['away', 0.6],
    ['home', 0.25],
    [EOS, 0.15],
  ],
  down: [[EOS, 1]],
  away: [[EOS, 1]],
  home: [[EOS, 1]],
};

/** Words a search may start after. */
export const STARTS = Object.keys(TABLE);

export type Eos = 'shrink' | 'refill';

export interface BeamSettings {
  [key: string]: Scalar;
  width: number;
  norm: boolean;
  eos: Eos;
  maxLen: number;
}

export const defaults: BeamSettings = { width: 2, norm: false, eos: 'shrink', maxLen: 5 };

export const MAX_WIDTH = 3;

export interface Hyp {
  id: number;
  parent: number | null;
  token: string;
  /** P(token | the parent's token); 1 for the root. */
  p: number;
  /** ln P of the tokens after the start. */
  score: number;
  /** Tokens after the start. */
  len: number;
  depth: number;
}

export type Status = 'root' | 'new' | 'live' | 'expanded' | 'pruned' | 'finished' | 'cut';

export interface Search {
  start: string;
  width: number;
  greedy: boolean;
  nodes: Hyp[];
  /** Finished hypotheses, in the order they finished (cut ones last). */
  finished: number[];
  best: number | null;
  /** How each node ends up. */
  status: Status[];
  norm: boolean;
}

export interface BeamState {
  search?: Search;
}

/** A step of a search in progress: how many nodes are drawn and how each looks. */
export interface BeamWork {
  search: Search;
  shown: number;
  status: Status[];
  finished: number[];
  /** The beam's width now (shrink narrows it). */
  room: number;
  t: number;
}

export interface BeamExtra {
  work?: BeamWork;
}

type S = BeamState;
type X = BeamExtra;
type Op = OpSpec<S, BeamSettings, X>;
type BStep = Step<S, X>;

export const words = (s: Search, id: number): string[] => {
  const out: string[] = [];
  for (let h: Hyp | undefined = s.nodes[id]; h && h.parent !== null; h = s.nodes[h.parent])
    out.unshift(h.token);
  return out;
};

export const ended = (h: Hyp) => h.token === EOS;
export const finalScore = (h: Hyp, norm: boolean) =>
  norm && h.len > 0 ? h.score / h.len : h.score;

/** Candidates by score, best first; equal scores keep the order they were made in. */
const byScore = (nodes: readonly Hyp[]) => (a: number, b: number) =>
  nodes[b]!.score - nodes[a]!.score || a - b;

/**
 * The whole search, with a record of each step for the narration: run once, then replayed as
 * steps. The code tabs make the same choices in the same order.
 */
export interface Trace {
  search: Search;
  rounds: Round[];
}

interface Round {
  t: number;
  /** The beam extended, best first. */
  beam: number[];
  /** Candidates by score, best first. */
  ranked: number[];
  kept: number[];
  finishedNow: number[];
  pruned: number[];
  roomBefore: number;
  roomAfter: number;
  /** Ids of the nodes made this round, by parent. */
  made: number[][];
  /** Refill: B have finished, so these, still going, are dropped and the search stops. */
  stopped: number[];
}

export function runSearch(start: string, settings: BeamSettings, greedy: boolean): Trace {
  const width = greedy ? 1 : Math.max(1, Math.min(MAX_WIDTH, Math.round(settings.width)));
  const nodes: Hyp[] = [{ id: 0, parent: null, token: start, p: 1, score: 0, len: 0, depth: 0 }];
  const status: Status[] = ['root'];
  const finished: number[] = [];
  const rounds: Round[] = [];
  let beam = [0];
  let room = width;
  for (let t = 1; t <= settings.maxLen && beam.length > 0; t++) {
    const made: number[][] = [];
    const cands: number[] = [];
    for (const h of beam) {
      const kids: number[] = [];
      for (const [w, p] of TABLE[nodes[h]!.token] ?? []) {
        const id = nodes.length;
        nodes.push({
          id,
          parent: h,
          token: w,
          p,
          score: nodes[h]!.score + Math.log(p),
          len: t,
          depth: t,
        });
        status.push('pruned');
        kids.push(id);
        cands.push(id);
      }
      made.push(kids);
      status[h] = h === 0 ? 'root' : 'expanded';
    }
    const ranked = [...cands].sort(byScore(nodes));
    const kept: number[] = [];
    const finishedNow: number[] = [];
    const roomBefore = room;
    if (settings.eos === 'shrink') {
      for (const c of ranked.slice(0, room)) {
        if (ended(nodes[c]!)) finishedNow.push(c);
        else kept.push(c);
      }
      room -= finishedNow.length;
    } else {
      ranked.forEach((c, rank) => {
        if (ended(nodes[c]!)) {
          if (rank < width) finishedNow.push(c);
        } else if (kept.length < width) kept.push(c);
      });
    }
    for (const c of kept) status[c] = 'live';
    for (const c of finishedNow) status[c] = 'finished';
    finished.push(...finishedNow);
    const pruned = ranked.filter((c) => !kept.includes(c) && !finishedNow.includes(c));
    const stop = settings.eos === 'shrink' ? room === 0 : finished.length >= width;
    const stopped = stop ? kept : [];
    for (const c of stopped) status[c] = 'pruned';
    rounds.push({
      t,
      beam,
      ranked,
      kept,
      finishedNow,
      pruned,
      roomBefore,
      roomAfter: room,
      made,
      stopped,
    });
    beam = stop ? [] : kept;
    if (stop) break;
  }
  // Still going at the length limit: cut there.
  for (const c of beam) {
    status[c] = 'cut';
    finished.push(c);
  }
  let best: number | null = null;
  for (const f of finished)
    if (
      best === null ||
      finalScore(nodes[f]!, settings.norm) > finalScore(nodes[best]!, settings.norm)
    )
      best = f;
  return {
    search: { start, width, greedy, nodes, finished, best, status, norm: settings.norm },
    rounds,
  };
}

/** Every complete output of at most maxLen tokens, by brute force: what beam search approximates. */
export function exhaustive(start: string, maxLen: number, norm: boolean) {
  let best: { words: string[]; score: number; len: number } | null = null;
  const walk = (tok: string, ws: string[], score: number) => {
    const done = tok === EOS || ws.length === maxLen;
    if (done && ws.length > 0) {
      const key = norm ? score / ws.length : score;
      if (!best || key > (norm ? best.score / best.len : best.score))
        best = { words: ws, score, len: ws.length };
      if (tok === EOS || ws.length === maxLen) return;
    }
    for (const [w, p] of TABLE[tok] ?? []) walk(w, [...ws, w], score + Math.log(p));
  };
  walk(start, [], 0);
  return best as { words: string[]; score: number; len: number } | null;
}

// ---------------------------------------------------------------------------------------------
// Input

export function parseStart(text: string): string | Error {
  const t = text.trim().toLowerCase();
  if (t === '<s>' || t === 'start' || t === 's') return BOS;
  if (Object.hasOwn(TABLE, t)) return t;
  return new Error(
    `Start from <s> (nothing yet) or after one of the model's words: ${STARTS.filter((w) => w !== BOS).join(', ')}.`,
  );
}

export const init = (): S => ({});

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const nodeId = (id: number) => `h-${id}`;
const ln = (x: number) => two(x);
const text = (s: Search, id: number) => {
  const ws = words(s, id);
  return ws.length ? ws.join(' ') : s.start;
};
const quoted = (s: Search, id: number) => `"${text(s, id)}"`;
const and = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

export function baseVars(settings: BeamSettings, greedy = false): Record<string, Scalar> {
  return { B: greedy ? 1 : settings.width, 'max length': settings.maxLen };
}

function searchOp(greedy: boolean): Op {
  return {
    label: greedy ? 'Greedy' : 'Beam search',
    arity: 1,
    *run(s, args, { settings }) {
      const start = parseStart(String(args[0]));
      if (start instanceof Error) {
        yield {
          state: s,
          marks: [],
          say: start.message,
          lines: [],
          level: 1,
          vars: baseVars(settings, greedy),
        };
        return s;
      }
      const { search, rounds } = runSearch(start, settings, greedy);
      const nodes = search.nodes;
      const status: Status[] = nodes.map((_, i) => (i === 0 ? 'root' : 'new'));
      const finished: number[] = [];
      let shown = 1;
      let room = search.width;
      let t = 0;
      const vars = (): Record<string, Scalar> => ({
        ...baseVars(settings, greedy),
        step: t,
        'beam width now': room,
        finished: finished.length,
      });
      const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): BStep => ({
        state: s,
        marks,
        say,
        lines,
        level,
        vars: vars(),
        extra: { work: { search, shown, status: [...status], finished: [...finished], room, t } },
      });
      yield step(
        `Start after ${start}: the beam holds one hypothesis, with log-probability 0. ${greedy ? 'Greedy keeps only the best one at each step (B = 1).' : `At each step, extend every hypothesis in the beam by every next word and keep the best B = ${search.width}.`}`,
        ['init'],
        2,
        [mark(nodeId(0), 'active')],
      );
      for (const r of rounds) {
        t = r.t;
        for (const [k, h] of r.beam.entries()) {
          const kids = r.made[k]!;
          shown = Math.max(shown, ...kids.map((c) => c + 1));
          const parts = kids.map((c) => {
            const n = nodes[c]!;
            return `${n.token} ${two(n.p)}: ${ln(nodes[h]!.score)} + ln ${two(n.p)} = ${ln(n.score)}`;
          });
          yield step(
            `Extend ${quoted(search, h)} (${ln(nodes[h]!.score)}) by each word that can follow ${nodes[h]!.token}: ${parts.join('; ')}.`,
            ['for', 'extend'],
            3,
            [mark(nodeId(h), 'active'), ...kids.map((c) => mark(nodeId(c), 'new'))],
          );
        }
        for (const c of r.kept) status[c] = 'live';
        for (const c of r.finishedNow) status[c] = 'finished';
        for (const c of r.pruned) status[c] = 'pruned';
        for (const h of r.beam) if (h !== 0) status[h] = 'expanded';
        finished.push(...r.finishedNow);
        room = r.roomAfter;
        const named = (c: number) => `${quoted(search, c)} (${ln(nodes[c]!.score)})`;
        const doneNames = r.finishedNow.map(named);
        const ends = (xs: string[]) => `${and(xs)} ${xs.length === 1 ? 'ends' : 'end'} with </s>`;
        let say: string;
        if (settings.eos === 'shrink') {
          const top = r.ranked.slice(0, r.roomBefore);
          say = `Step ${r.t}: ${r.ranked.length} ${r.ranked.length === 1 ? 'candidate' : 'candidates'}. Rank them by log-probability and keep the best ${r.roomBefore}: ${and(top.map(named))}.`;
          if (doneNames.length)
            say += ` ${ends(r.finishedNow.map((c) => quoted(search, c)))}: set aside as finished, and the beam narrows to ${r.roomAfter}.`;
        } else {
          say = `Step ${r.t}: ${r.ranked.length} ${r.ranked.length === 1 ? 'candidate' : 'candidates'}. Rank them by log-probability and keep the best ${search.width} that have not ended: ${r.kept.length ? and(r.kept.map(named)) : 'none are left'}.`;
          if (doneNames.length)
            say += ` ${ends(doneNames)} among the best ${search.width}: set aside as finished (${finished.length} of ${search.width}).`;
        }
        if (r.pruned.length)
          say += ` Drop ${r.pruned.length === 1 ? 'the other one' : `the other ${r.pruned.length}`}${r.pruned.length <= 3 ? `: ${and(r.pruned.map((c) => quoted(search, c)))}` : ''}.`;
        if (r.stopped.length) {
          for (const c of r.stopped) status[c] = 'pruned';
          say += ` ${search.width} have finished, so the search stops here, and ${and(r.stopped.map((c) => quoted(search, c)))}, still going, ${r.stopped.length === 1 ? 'is' : 'are'} dropped.`;
        }
        yield step(say, ['rank', 'keep'], 2, [
          ...r.kept.map((c) => mark(nodeId(c), 'active')),
          ...r.finishedNow.map((c) => mark(nodeId(c), 'done')),
        ]);
      }
      const cut = search.status.flatMap((st, i) => (st === 'cut' ? [i] : []));
      for (const c of cut) {
        status[c] = 'cut';
        finished.push(c);
      }
      const next: S = { search };
      const best = search.best;
      const lines = (id: number) => {
        const h = nodes[id]!;
        return search.norm
          ? `${quoted(search, id)} ${ln(h.score)} / ${h.len} = ${two(h.score / h.len)}`
          : `${quoted(search, id)} ${ln(h.score)}`;
      };
      const brute = exhaustive(start, settings.maxLen, search.norm);
      const bestP = best === null ? 0 : Math.exp(nodes[best]!.score);
      const optimal =
        brute && best !== null && brute.words.join(' ') === words(search, best).join(' ');
      yield {
        state: next,
        marks: best === null ? [] : [mark(nodeId(best), 'found')],
        say:
          best === null
            ? `Nothing could follow ${start}.`
            : `${cut.length ? `The length limit (${settings.maxLen}) cuts ${and(cut.map((c) => quoted(search, c)))}. ` : ''}Finished: ${search.finished.map(lines).join(', ')}. ${search.norm ? 'Divided by length, the best' : 'The best'} is ${quoted(search, best)}, probability e^${ln(nodes[best]!.score)} = ${two(bestP)}.${
                brute
                  ? optimal
                    ? ' No sentence of the model scores better: this is the best possible.'
                    : ` Not the best possible: "${brute.words.join(' ')}" scores ${ln(brute.score)}${search.norm ? ` (${two(brute.score / brute.len)} per token)` : ''}, but the search dropped it on the way.`
                  : ''
              }`,
        lines: ['best'],
        level: 1,
        vars: {
          ...baseVars(settings, greedy),
          step: rounds.length,
          finished: search.finished.length,
          ...(best === null ? {} : { 'best P': Math.round(bestP * 1000) / 1000 }),
        },
      };
      return next;
    },
  };
}

export const ops = { search: searchOp(false), greedy: searchOp(true) };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, textLine: string, plain: string) => ({
  id,
  indent,
  text: textLine,
  plain,
});

export function pseudocode(settings: BeamSettings): PseudoBlock[] {
  const keep =
    settings.eos === 'shrink'
      ? [
          L(
            'keep',
            2,
            'beam = the best B; each that ends with </s> moves to finished and B -= 1',
            'Keep the best few; a finished one is put aside and the beam gets one narrower.',
          ),
          L('stop', 1, 'until B = 0 or t = max length', 'Stop when nothing is left to grow.'),
        ]
      : [
          L(
            'keep',
            2,
            'finished += those ending with </s> among the best B; beam = the best B not ended',
            'Put aside finished ones near the top; refill the beam with the best that are still going.',
          ),
          L('stop', 1, 'until B have finished or t = max length', 'Stop once enough are finished.'),
        ];
  const lines = (sig: string, plain: string) => [
    L('sig', 0, sig, plain),
    L(
      'init',
      1,
      'beam = [start], score(start) = 0',
      'Begin with just the start, log-probability 0.',
    ),
    L('for', 1, 'repeat, t = 1, 2, …', 'Then, one word at a time:'),
    L(
      'extend',
      2,
      'for h in beam, w in V: score(h + w) = score(h) + ln P(w | h)',
      'Try every next word after every hypothesis, adding the log of its probability.',
    ),
    L('rank', 2, 'sort the candidates by score', 'Rank all the candidates, best first.'),
    ...keep,
    L(
      'best',
      1,
      settings.norm
        ? 'return argmax over finished of score(h) / |h|'
        : 'return argmax over finished of score(h)',
      settings.norm
        ? 'Pick the finished one with the best score per word.'
        : 'Pick the finished one with the best score.',
    ),
  ];
  return [
    {
      op: 'search',
      lines: lines(
        'BEAM-SEARCH(start, B)',
        'Search for a likely sentence, keeping B guesses at a time:',
      ),
    },
    {
      op: 'greedy',
      lines: lines(
        'GREEDY(start) = BEAM-SEARCH(start, 1)',
        'Take the likeliest next word each time:',
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(): string {
  return 'A tiny model gives the probability of each next word given the one before it. Press Beam search to grow a tree of guesses from <s>, keeping the best B at each step, or Greedy to keep only the best one.';
}

export const initialVars = (_s: S, settings: BeamSettings) => baseVars(settings);

export function describe(s: S): string {
  const sr = s.search;
  if (!sr) return 'No search yet.';
  const fin = sr.finished.map((f) => `${text(sr, f)} (${two(sr.nodes[f]!.score)})`).join(', ');
  return `Search after ${sr.start} with B = ${sr.width}: finished ${fin}. Best: ${sr.best === null ? 'none' : text(sr, sr.best)}.`;
}

export { text as hypText };
