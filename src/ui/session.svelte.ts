import { makeExample } from '../engine/example';
import { randomSeed } from '../engine/rng';
import { Timeline } from '../engine/timeline';
import type { AnyVizDef, Level, OpCall, SavedExample, Settings, Value } from '../engine/types';
import { notify } from './state.svelte';

type AnyTimeline = Timeline<unknown, Settings, unknown>;

export function formatCall([name, ...args]: OpCall): string {
  const fmt = (v: Value) => (typeof v === 'string' ? `"${v}"` : String(v));
  return `${name}(${args.map(fmt).join(', ')})`;
}

/**
 * Everything a visualization page needs at runtime: the timeline, where we are in it,
 * and playback. The Timeline is mutated in place, so `version` is bumped on every change.
 */
export class Session {
  readonly def: AnyVizDef;
  private tl: AnyTimeline;
  private timer: ReturnType<typeof setTimeout> | undefined;

  version = $state(0);
  cursor = $state(0);
  playing = $state(false);
  speed = $state(1);
  detail = $state<Level>(2);
  /** Whether the next scene change should animate. Jumps and scrubbing do not. */
  animate = $state(true);

  constructor(def: AnyVizDef, opts: { speed: number; detail: Level }) {
    this.def = def;
    this.speed = opts.speed;
    this.detail = opts.detail;
    this.tl = new Timeline(def, { ...def.defaults }, randomSeed());
  }

  get timeline(): AnyTimeline {
    void this.version;
    return this.tl;
  }

  get settings(): Settings {
    return this.timeline.settings;
  }

  /**
   * The operations run so far. A fresh array on every read: the timeline mutates its own array
   * in place, and Svelte treats a derived value with the same reference as unchanged.
   */
  get entries() {
    return [...this.timeline.entries];
  }

  get current() {
    return this.timeline.at(this.cursor);
  }

  get stepMs(): number {
    return 1300 / this.speed;
  }

  get tweenMs(): number {
    return Math.min(650, this.stepMs * 0.55);
  }

  get atEnd(): boolean {
    return this.timeline.next(this.cursor, this.detail) === null;
  }

  get atStart(): boolean {
    return this.timeline.prev(this.cursor, this.detail) === null;
  }

  /** Global indices where an operation ends (plus 0, the start). */
  get boundaries(): number[] {
    const t = this.timeline;
    return [0, ...t.entries.map((_, k) => t.endOf(k))];
  }

  run(calls: OpCall[]): void {
    if (calls.length === 0) return;
    const wasPlaying = this.playing;
    const { discarded, firstNew } = this.tl.apply(calls, this.cursor);
    this.version++;
    if (discarded > 0) {
      notify(
        `Replaced ${discarded} later ${discarded === 1 ? 'operation' : 'operations'} in the history.`,
      );
    }
    if (!wasPlaying) {
      this.cursor = firstNew - 1;
      this.play(false);
    }
  }

  play(restart = true): void {
    clearTimeout(this.timer);
    if (this.atEnd) {
      if (!restart) return;
      // Show the starting state for a moment before replaying from the top.
      this.animate = false;
      this.cursor = 0;
      this.playing = true;
      this.timer = setTimeout(this.advance, Math.min(600, this.stepMs / 2));
      return;
    }
    this.playing = true;
    this.advance();
  }

  private advance = (): void => {
    clearTimeout(this.timer);
    const n = this.tl.next(this.cursor, this.detail);
    if (n === null) {
      this.playing = false;
      return;
    }
    this.animate = true;
    this.cursor = n;
    if (this.tl.next(n, this.detail) === null) {
      this.playing = false;
      return;
    }
    this.timer = setTimeout(this.advance, this.stepMs);
  };

  pause(): void {
    clearTimeout(this.timer);
    this.playing = false;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  stepForward(): void {
    this.pause();
    const n = this.tl.next(this.cursor, this.detail);
    if (n !== null) {
      this.animate = true;
      this.cursor = n;
    }
  }

  stepBack(): void {
    this.pause();
    const p = this.tl.prev(this.cursor, this.detail);
    if (p !== null) {
      this.animate = true;
      this.cursor = p;
    }
  }

  prevOp(): void {
    const before = this.boundaries.filter((b) => b < this.cursor);
    this.jump(before.length ? before[before.length - 1]! : 0, true);
  }

  nextOp(): void {
    const after = this.boundaries.find((b) => b > this.cursor);
    this.jump(after ?? this.tl.length - 1, true);
  }

  jump(i: number, animate = false): void {
    this.pause();
    this.animate = animate;
    this.cursor = Math.max(0, Math.min(i, this.tl.length - 1));
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.playing) {
      clearTimeout(this.timer);
      this.timer = setTimeout(this.advance, this.stepMs);
    }
  }

  setDetail(detail: Level): void {
    this.detail = detail;
    if (!this.tl.visible(this.cursor, detail)) {
      this.jump(this.tl.next(this.cursor, detail) ?? this.tl.prev(this.cursor, detail) ?? 0);
    }
  }

  setSettings(patch: Settings): void {
    this.pause();
    const { op, index } = this.tl.at(this.cursor);
    this.tl = new Timeline(
      this.def,
      { ...this.tl.settings, ...patch },
      this.tl.seed,
      this.tl.calls,
    );
    this.version++;
    this.animate = false;
    this.cursor = this.tl.indexOf(op, index);
  }

  load(ex: SavedExample): void {
    this.pause();
    this.tl = new Timeline(this.def, ex.settings, ex.seed, ex.ops);
    this.version++;
    this.animate = false;
    this.cursor = ex.at ? this.tl.indexOf(ex.at.op, ex.at.step) : this.tl.length - 1;
  }

  undoLast(): void {
    const n = this.tl.entries.length;
    if (n === 0) return;
    this.tl.apply([], this.tl.endOf(n - 2));
    this.version++;
    this.jump(this.tl.length - 1);
  }

  clearHistory(): void {
    this.tl.apply([], 0);
    this.version++;
    this.jump(0);
  }

  toExample(meta: { title?: string; notes?: string } = {}): SavedExample {
    const { op, index } = this.current;
    return makeExample(
      this.def.id,
      this.settings,
      this.tl.seed,
      this.tl.calls,
      { op, step: index },
      meta,
    );
  }

  destroy(): void {
    clearTimeout(this.timer);
  }
}
