import { pageSummary, type PageSummary, type Progress } from '../progress/progress';
import { families } from '../viz/catalog';
import algorithms from './data/algorithms';
import computation from './data/computation';
import dataStructures from './data/data-structures';
import interviews from './data/interviews';
import llms from './data/llms';

/**
 * Learning paths: a short, ordered route through the site for one kind of learner (a first data
 * structures course, interview preparation, how LLMs work, ...). Each path has its own page,
 * /path/<id>/, written by scripts/prerender.mjs. A step is one visualization page, done when the
 * page is finished (every lesson read and every check answered right, `pageSummary`), so a path's
 * progress comes from the progress the site already keeps and syncs; nothing new is stored.
 */
export interface PathStep {
  /** The visualization's id, as in src/viz/catalog.ts. */
  viz: string;
  /** One line: why this page comes here, and what to look for. */
  note: string;
  /** A curated example of that page to open first (its `id` in examples/*.json). */
  example?: string;
}

export interface PathStage {
  title: string;
  steps: PathStep[];
}

export interface PathDef {
  /** The address is /path/<id>/. */
  id: string;
  title: string;
  /** Who it is for, in a few words, for the card on the home page. */
  audience: string;
  /** One sentence for the card and the page's description. */
  blurb: string;
  /** A paragraph or two at the top of the path's page. */
  intro: string;
  stages: PathStage[];
}

/** Every path, in the order the home page shows them. */
export const paths: PathDef[] = [dataStructures, algorithms, interviews, llms, computation];

export const findPath = (id: string): PathDef | undefined => paths.find((p) => p.id === id);

export const pathSteps = (path: PathDef): PathStep[] => path.stages.flatMap((s) => s.steps);

/** A page's title as the catalog shows it. */
export const vizTitle = (viz: string): string =>
  families.flatMap((f) => f.items).find((i) => i.id === viz)?.title ?? viz;

/** The step of a path on page `viz`, and its number (1 for the first). */
export function stepOf(path: PathDef, viz: string): { n: number; step: PathStep } | undefined {
  const i = pathSteps(path).findIndex((s) => s.viz === viz);
  return i < 0 ? undefined : { n: i + 1, step: pathSteps(path)[i]! };
}

export const pathHref = (id: string): string => `/path/${id}/`;

export interface StepStatus {
  step: PathStep;
  /** 1 for the first step of the path. */
  n: number;
  summary: PageSummary;
}

export interface PathProgress {
  steps: StepStatus[];
  total: number;
  finished: number;
  started: number;
  /** Whole percent of steps finished, rounded down so 100 means every step. */
  percent: number;
  /** The first step not finished yet, or undefined once every step is. */
  next: StepStatus | undefined;
}

export function pathProgress(p: Progress, path: PathDef): PathProgress {
  const steps = pathSteps(path).map((step, i) => ({
    step,
    n: i + 1,
    summary: pageSummary(p, step.viz),
  }));
  const finished = steps.filter((s) => s.summary.finished).length;
  return {
    steps,
    total: steps.length,
    finished,
    started: steps.filter((s) => s.summary.started).length,
    percent: steps.length ? Math.floor((100 * finished) / steps.length) : 0,
    next: steps.find((s) => !s.summary.finished),
  };
}
