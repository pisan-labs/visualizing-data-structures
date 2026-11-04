import { deriveSeed, makeRng } from './rng';
import type { Level, OpCall, Settings, Step, VizDef } from './types';

export interface Entry<S, X> {
  call: OpCall;
  steps: Step<S, X>[];
  end: S;
}

export interface FlatStep<S, X> {
  step: Step<S, X>;
  /** Operation index, or -1 for the starting step. */
  op: number;
  /** Index of the step within its operation. */
  index: number;
}

/** Run one operation to completion and collect its steps. */
export function runOp<S, Set extends Settings, X>(
  def: VizDef<S, Set, X>,
  state: S,
  call: OpCall,
  settings: Set,
  seed: number,
  opIndex: number,
): Entry<S, X> {
  const [name, ...args] = call;
  const spec = def.ops[name];
  if (!spec) throw new Error(`Unknown operation "${name}" for ${def.id}`);
  const gen = spec.run(state, args, { settings, rng: makeRng(deriveSeed(seed, opIndex)) });
  const steps: Step<S, X>[] = [];
  let r = gen.next();
  while (!r.done) {
    steps.push(r.value);
    r = gen.next();
  }
  const end = r.value;
  if (steps.length === 0) {
    steps.push({ state: end, marks: [], say: `${name} done.`, lines: [], level: 1 });
  }
  // The last step of every operation is a milestone, so coarse playback never skips a result.
  const last = steps[steps.length - 1]!;
  if (last.level !== 1) steps[steps.length - 1] = { ...last, level: 1 };
  return { call, steps, end };
}

/**
 * The full history of a session: a starting step plus the steps of every operation.
 * Steps are addressed by a global index; index 0 is the starting step.
 */
export class Timeline<S, Set extends Settings, X = unknown> {
  readonly initial: Step<S, X>;
  readonly entries: Entry<S, X>[] = [];
  private flat: FlatStep<S, X>[] = [];

  constructor(
    readonly def: VizDef<S, Set, X>,
    readonly settings: Set,
    readonly seed: number,
    calls: OpCall[] = [],
  ) {
    const state = def.init(settings);
    this.initial = {
      state,
      marks: [],
      say: def.initialSay(state, settings),
      lines: [],
      vars: def.initialVars?.(state, settings),
      level: 1,
    };
    this.flat.push({ step: this.initial, op: -1, index: 0 });
    for (const call of calls) this.append(call);
  }

  get length(): number {
    return this.flat.length;
  }

  get calls(): OpCall[] {
    return this.entries.map((e) => e.call);
  }

  at(i: number): FlatStep<S, X> {
    const f = this.flat[Math.max(0, Math.min(i, this.flat.length - 1))];
    return f!;
  }

  endState(): S {
    return this.entries.length ? this.entries[this.entries.length - 1]!.end : this.initial.state;
  }

  private append(call: OpCall): void {
    const opIndex = this.entries.length;
    const entry = runOp(this.def, this.endState(), call, this.settings, this.seed, opIndex);
    this.entries.push(entry);
    entry.steps.forEach((step, index) => this.flat.push({ step, op: opIndex, index }));
  }

  /**
   * Run `calls` after the operation that contains global step `cursor`.
   * Later operations are discarded (like typing after an undo).
   * Returns how many operations were discarded and the global index where the new ones start.
   */
  apply(calls: OpCall[], cursor: number): { discarded: number; firstNew: number } {
    const op = this.at(cursor).op;
    const keep = op + 1;
    const discarded = this.entries.length - keep;
    if (discarded > 0) {
      this.entries.splice(keep);
      this.flat = this.flat.filter((f) => f.op < keep);
    }
    const firstNew = this.flat.length;
    for (const call of calls) this.append(call);
    return { discarded, firstNew };
  }

  /** Global index of a step by (op, index); clamps out-of-range values. */
  indexOf(op: number, index: number): number {
    if (op < 0 || this.entries.length === 0) return 0;
    const o = Math.min(op, this.entries.length - 1);
    let base = 1;
    for (let k = 0; k < o; k++) base += this.entries[k]!.steps.length;
    const n = this.entries[o]!.steps.length;
    return base + Math.max(0, Math.min(index, n - 1));
  }

  /** Global index of the last step of operation `op` (0 for op -1). */
  endOf(op: number): number {
    if (op < 0) return 0;
    return this.indexOf(op, Number.MAX_SAFE_INTEGER);
  }

  visible(i: number, detail: Level): boolean {
    return this.at(i).step.level <= detail;
  }

  next(i: number, detail: Level): number | null {
    for (let j = i + 1; j < this.flat.length; j++) if (this.visible(j, detail)) return j;
    return null;
  }

  prev(i: number, detail: Level): number | null {
    for (let j = i - 1; j >= 0; j--) if (this.visible(j, detail)) return j;
    return null;
  }

  /** Indices of all steps shown at this detail level, for the scrubber. */
  visibleIndices(detail: Level): number[] {
    const out: number[] = [];
    for (let j = 0; j < this.flat.length; j++) if (this.visible(j, detail)) out.push(j);
    return out;
  }
}
