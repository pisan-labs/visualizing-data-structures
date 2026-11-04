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
  text: string;
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
}

export interface Controls {
  input?: {
    label: string;
    placeholder: string;
    maxLength: number;
    parse(token: string): Value | Error;
  };
  buttons: ControlButton[];
  random?: { label: string; make(rng: Rng): OpCall[] };
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
}

// Erased form used by generic UI code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyVizDef = VizDef<any, any, any>;
