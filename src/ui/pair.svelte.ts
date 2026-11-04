import { keepShared, sharedControls, sharedOps } from '../engine/compare';
import type { Controls, Level, OpCall, Settings } from '../engine/types';
import type { Session } from './session.svelte';

/** What the playback bar needs. A Session has all of it, and so does a Pair. */
export interface Playback {
  readonly playing: boolean;
  readonly atStart: boolean;
  readonly atEnd: boolean;
  readonly speed: number;
  readonly detail: Level;
  toggle(): void;
  stepForward(): void;
  stepBack(): void;
  prevOp(): void;
  nextOp(): void;
  setSpeed(speed: number): void;
  setDetail(detail: Level): void;
}

/** What the operation controls need: the buttons to show and where to send what they run. */
export interface OpTarget {
  readonly def: { readonly controls: Controls };
  /** The options presets should suit: the page's, or the first page's on a compare page. */
  readonly settings: Settings;
  run(calls: OpCall[]): void;
  fill(calls: OpCall[]): void;
}

/**
 * Two sessions that receive the same operations, for compare mode. Both histories always hold
 * the same operations, so operation k means the same thing on both sides. Playback stays in step
 * by operation: a side that finishes an operation first waits for the other one, so the two
 * pictures always show the same operation.
 */
export class Pair implements OpTarget, Playback {
  readonly def: { readonly controls: Controls };
  private readonly shared: Set<string>;
  private timer: ReturnType<typeof setTimeout> | undefined;

  playing = $state(false);

  constructor(
    readonly a: Session,
    readonly b: Session,
  ) {
    this.shared = sharedOps(a.def, b.def);
    this.def = { controls: sharedControls(a.def, b.def) };
  }

  get sides(): Session[] {
    return [this.a, this.b];
  }

  /**
   * Both sides run the calls after the same operation, so their histories stay equal. While
   * playing they queue up after the last operation; otherwise they replace what follows the
   * operation on screen (the side that is further along decides, so neither loses a step it
   * is showing).
   */
  run(calls: OpCall[]): void {
    const ok = keepShared(calls, this.shared);
    if (ok.length === 0) return;
    const after = this.playing
      ? this.a.timeline.entries.length - 1
      : Math.max(this.a.current.op, this.b.current.op);
    const firstA = this.a.append(ok, after, true);
    const firstB = this.b.append(ok, after);
    if (!this.playing) {
      this.a.jump(firstA - 1);
      this.b.jump(firstB - 1);
      this.play();
    }
  }

  /** Start both sides over with these operations and show the result. */
  fill(calls: OpCall[]): void {
    this.pause();
    const ok = keepShared(calls, this.shared);
    this.a.fill(ok);
    this.b.fill(ok);
  }

  /** The operation a side shows next: the one it is in the middle of, or the one after. */
  private upcoming(s: Session): number {
    const op = s.current.op;
    return s.cursor === s.timeline.endOf(op) ? op + 1 : op;
  }

  /** The operation of the step before the cursor, or -2 at the very start. */
  private previous(s: Session): number {
    const p = s.timeline.prev(s.cursor, s.detail);
    return p === null ? -2 : s.timeline.at(p).op;
  }

  get atEnd(): boolean {
    return this.a.atEnd && this.b.atEnd;
  }

  get settings(): Settings {
    return this.a.settings;
  }

  get speed(): number {
    return this.a.speed;
  }

  get detail(): Level {
    return this.a.detail;
  }

  get atStart(): boolean {
    return this.a.atStart && this.b.atStart;
  }

  /**
   * One step forward. Only a side still inside the earliest unfinished operation moves, so a side
   * that is done waits at the end of the operation for the other one.
   */
  private forward(): boolean {
    const t = Math.min(this.upcoming(this.a), this.upcoming(this.b));
    let moved = false;
    for (const s of this.sides) {
      if (this.upcoming(s) !== t) continue;
      const n = s.timeline.next(s.cursor, s.detail);
      if (n !== null) {
        s.jump(n, true);
        moved = true;
      }
    }
    return moved;
  }

  /** One step back, mirroring `forward`: the side that is further ahead moves first. */
  private backward(): boolean {
    const t = Math.max(this.previous(this.a), this.previous(this.b));
    if (t === -2) return false;
    let moved = false;
    for (const s of this.sides) {
      if (this.previous(s) !== t) continue;
      const p = s.timeline.prev(s.cursor, s.detail);
      if (p !== null) {
        s.jump(p, true);
        moved = true;
      }
    }
    return moved;
  }

  play(): void {
    clearTimeout(this.timer);
    if (this.atEnd) {
      // Show the starting state for a moment before replaying from the top, as one page does.
      this.a.jump(0);
      this.b.jump(0);
      this.playing = true;
      this.timer = setTimeout(this.tick, Math.min(600, this.a.stepMs / 2));
      return;
    }
    this.playing = true;
    this.tick();
  }

  private tick = (): void => {
    clearTimeout(this.timer);
    if (!this.forward() || this.atEnd) {
      this.playing = false;
      return;
    }
    this.timer = setTimeout(this.tick, this.a.stepMs);
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
    this.forward();
  }

  stepBack(): void {
    this.pause();
    this.backward();
  }

  /** Both sides to the end of the next operation either of them has not finished. */
  nextOp(): void {
    this.pause();
    const t = Math.min(this.upcoming(this.a), this.upcoming(this.b));
    if (t >= this.a.timeline.entries.length) return;
    for (const s of this.sides) s.jump(s.timeline.endOf(t), true);
  }

  /** Both sides to the end of the operation before the earlier side's current one. */
  prevOp(): void {
    this.pause();
    const t = Math.min(this.a.current.op, this.b.current.op) - 1;
    for (const s of this.sides) s.jump(t < 0 ? 0 : s.timeline.endOf(t), true);
  }

  setSpeed(speed: number): void {
    for (const s of this.sides) s.setSpeed(speed);
    if (this.playing) {
      clearTimeout(this.timer);
      this.timer = setTimeout(this.tick, this.a.stepMs);
    }
  }

  setDetail(detail: Level): void {
    for (const s of this.sides) s.setDetail(detail);
  }

  destroy(): void {
    clearTimeout(this.timer);
    for (const s of this.sides) s.destroy();
  }
}
