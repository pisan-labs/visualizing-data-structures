import type { Scene } from '../render/scene';
import type { Rng } from './rng';

/** A value a learner can put into a structure. */
export type Value = number | string;
export type Scalar = string | number | boolean | null;

/** How a step wants an element drawn. Views map these to colors and styles. */
export type MarkRole =
  'active' | 'compare' | 'visit' | 'new' | 'remove' | 'found' | 'error' | 'done' | 'stale';

export interface Mark {
  id: string;
  role: MarkRole;
}

/** 1 = milestone (always shown), 2 = normal, 3 = fine detail. */
export type Level = 1 | 2 | 3;

/** A "predict the next step" question. The UI for it comes after Phase 5. */
export interface Prompt {
  question: string;
  choices: { id: string; label: string }[];
  answer: string;
  explain: string;
}

/** One moment a learner can stop on. Immutable. */
export interface Step<S, X = unknown> {
  state: S;
  marks: Mark[];
  /** Narration: one or two plain sentences. */
  say: string;
  /** Pseudocode line ids to highlight. */
  lines: string[];
  vars?: Record<string, Scalar>;
  level: Level;
  ask?: Prompt;
  /** Transient, view-only data for this step (a value in flight, a returned value...). */
  extra?: X;
}

export type OpCall = [name: string, ...args: Value[]];

export interface OpContext<Set> {
  settings: Set;
  rng: Rng;
}

export interface OpSpec<S, Set, X> {
  label: string;
  /** Number of arguments the operation takes. */
  arity: number;
  run(state: S, args: Value[], ctx: OpContext<Set>): Generator<Step<S, X>, S, void>;
}

export type Settings = Record<string, Scalar>;

export type SettingSpec =
  | {
      kind: 'choice';
      key: string;
      label: string;
      options: { value: string; label: string }[];
      help?: string;
    }
  | { kind: 'number'; key: string; label: string; min: number; max: number; help?: string }
  | { kind: 'boolean'; key: string; label: string; help?: string };

export interface PseudoLine {
  id: string;
  /** Formal pseudocode. */
  text: string;
  /** The same line in plain English, for the "Plain English" view. Same id, same highlighting. */
  plain: string;
  indent: number;
}

export interface PseudoBlock {
  /** Operation name this block belongs to. */
  op: string;
  lines: PseudoLine[];
}

export interface ControlButton {
  op: string;
  label: string;
  /** Takes its argument from the shared input field. */
  usesInput: boolean;
  /** "1 2 3" runs the operation once per value. */
  bulk?: boolean;
  primary?: boolean;
  /**
   * For an operation that takes several values, what each one is, in order, for example
   * ['an index', 'a value'] for insert(i, x). The learner types them separated by spaces and
   * the button makes one call. Leave it out when the operation takes one value.
   */
  args?: string[];
  /** Less common operations sit under "More operations" so the drawing stays in view. */
  more?: boolean;
}

export interface Controls {
  input?: {
    label: string;
    placeholder: string;
    maxLength: number;
    /** A valid input, used by the automatic browser tests. Defaults to "5". */
    sample?: string;
    parse(token: string): Value | Error;
  };
  buttons: ControlButton[];
  random?: { label: string; make(rng: Rng): OpCall[] };
  /**
   * "Fill with ..." presets: sorted, reverse, nearly sorted, random, skewed, worst case...
   * `make` returns the operations to run (for example one insert per value, or one "load").
   */
  presets?: Preset[];
  /** Sizes offered for presets. Default [5, 8, 12]. */
  sizes?: number[];
}

export interface Preset {
  label: string;
  make(rng: Rng, size: number): OpCall[];
}

/** One cell of the Big-O self-test: the answer, a one-line reason, and an example to try. */
export interface CostCase {
  cost: string;
  why: string;
  /** Id of a curated example that shows this case. */
  example?: string;
}

/** One row of the Big-O self-test table. Answers stay hidden until the learner reveals them. */
export interface ComplexityRow {
  /** The operation as learners know it, e.g. "push(x)" or "search(x)". */
  op: string;
  best: CostCase;
  average: CostCase;
  worst: CostCase;
  /** Optional remark shown under the row, e.g. "amortized over a sequence of pushes". */
  note?: string;
}

/**
 * Static code tabs. The shown sources are plain strings (imported with ?raw). Each language
 * also has a driver in src/viz/<id>/code/<lang>/ that reads operations from standard input,
 * one per line, and prints one line per result. src/viz/code.test.ts runs the drivers on
 * scripts and compares their output with what this visualization's own model produces.
 */
export interface CodeTabs {
  python: string;
  java: string;
  cpp: string;
  /** Convert operations into driver input lines and the output lines the model expects. */
  script(calls: OpCall[], settings: Settings): { input: string[]; expected: string[] };
}

export interface SavedExample {
  format: 1;
  viz: string;
  /** Curated examples have an id so concept pages can link to them. */
  id?: string;
  title?: string;
  notes?: string;
  settings: Settings;
  seed: number;
  ops: OpCall[];
  at?: { op: number; step: number };
}

export interface VizDef<S, Set extends Settings, X = unknown> {
  id: string;
  title: string;
  family: string;
  blurb: string;
  settings: SettingSpec[];
  defaults: Set;
  init(settings: Set): S;
  /** Narration for the starting step. */
  initialSay(state: S, settings: Set): string;
  initialVars?(state: S, settings: Set): Record<string, Scalar>;
  ops: Record<string, OpSpec<S, Set, X>>;
  pseudocode(settings: Set): PseudoBlock[];
  view(step: Step<S, X>, settings: Set): Scene;
  /** Plain-text summary of a state for screen readers. */
  describe(state: S, settings: Set): string;
  controls: Controls;
  /** Concept page, Markdown. */
  explain: string;
  examples: SavedExample[];
  /** Big-O self-test rows. */
  complexity: ComplexityRow[];
  /** Static code in three languages, tested against the model. */
  code?: CodeTabs;
}

// Erased form used by generic UI code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyVizDef = VizDef<any, any, any>;
