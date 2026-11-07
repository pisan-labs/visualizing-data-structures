/**
 * Random pushdown automata for presets, practice and tests. States are q0, q1, ...; q0 is the
 * start and pushes $ first, as Sipser's machines do, and every state can be reached from it.
 *
 *   randomPda(rng, n, { inputs, grow, deterministic })
 *     grow           ε-moves may push more than they pop (default false). Without it the
 *                    configurations at each place in the word are finite, so a search ends.
 *     deterministic  no two moves out of a state can both apply (default false)
 */
import type { Rng } from '../../engine/rng';
import { EPS, isDeterministicPda, makePda, type Pda, type PdaMove } from './pda';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

export interface RandomPdaOptions {
  inputs?: string[];
  grow?: boolean;
  deterministic?: boolean;
}

export function randomPda(rng: Rng, n: number, o: RandomPdaOptions = {}): Pda {
  const inputs = o.inputs ?? ['a', 'b'];
  const qs = Array.from({ length: Math.max(2, n) }, (_, i) => `q${i}`);
  const move = (from: string, to: string): PdaMove => {
    const read = rng.int(0, 3) === 0 ? EPS : pick(rng, inputs);
    const pop = pick(rng, [EPS, EPS, 'A', '$']);
    let push = pick(rng, ['', '', 'A', 'AA']);
    if (pop === '$' && rng.int(0, 1) === 0) push += '$';
    // An ε-move that grows the stack can make new configurations forever.
    if (read === EPS && !o.grow && push.length > (pop === EPS ? 0 : 1)) push = '';
    return { from, read, pop, to, push };
  };
  for (let attempt = 0; ; attempt++) {
    const moves: PdaMove[] = [{ from: 'q0', read: EPS, pop: EPS, to: 'q1', push: '$' }];
    for (let i = 2; i < qs.length; i++) moves.push(move(qs[rng.int(1, i - 1)]!, qs[i]!));
    const more = qs.length + rng.int(0, 2);
    for (let k = 0; k < more; k++)
      moves.push(move(qs[rng.int(1, qs.length - 1)]!, qs[rng.int(1, qs.length - 1)]!));
    // Every input symbol on some move, so a word over the alphabet can be typed.
    for (const c of inputs)
      if (!moves.some((m) => m.read === c))
        moves.push({ ...move(qs[1]!, qs[rng.int(1, qs.length - 1)]!), read: c });
    const accept = qs.filter((q, i) => i > 0 && rng.int(0, 2) === 0);
    const p = makePda({
      states: qs,
      inputs,
      stackSymbols: [],
      start: 'q0',
      accept: accept.length ? accept : [qs.at(-1)!],
      initial: '',
      moves,
    });
    if (!o.deterministic || isDeterministicPda(p)) return p;
    // Drop the later of two moves that clash, then use what is left if it still reads.
    const kept: PdaMove[] = [];
    for (const m of p.moves) {
      const q = makePda({ ...p, moves: [...kept, m] });
      if (isDeterministicPda(q)) kept.push(m);
    }
    const d = makePda({ ...p, inputs: [], moves: kept });
    if (inputs.every((c) => d.inputs.includes(c)) || attempt > 20) return makePda({ ...d, inputs });
  }
}
