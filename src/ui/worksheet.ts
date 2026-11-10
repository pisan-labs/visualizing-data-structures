import { Timeline } from '../engine/timeline';
import type { AnyVizDef, PracticeAnswer, PracticeQuestion } from '../engine/types';
import type { Scene } from '../render/scene';

/**
 * A practice question's picture: the plain state after its setup, with no highlights or values
 * in flight that could give the answer away.
 */
export function practiceScene(def: AnyVizDef, q: PracticeQuestion): Scene {
  const settings = { ...def.defaults, ...q.settings };
  const t = new Timeline(def, settings, 1, q.setup);
  return def.view({ ...t.at(t.length - 1).step, marks: [], extra: undefined }, settings);
}

/** The link that gives everyone this practice set (the Practice tab's "Copy assignment link"). */
export const assignmentLink = (origin: string, viz: string, seed: number, count: number): string =>
  `${origin}/${viz}/#practice=${seed}&n=${count}`;

/** A, B, C... for the options of a choice question on paper. */
export const choiceLetter = (k: number): string => String.fromCharCode(65 + k);

/** The answer as the worksheet's key gives it: the letter and the option, or the value. */
export function keyAnswer(answer: PracticeAnswer): string {
  switch (answer.kind) {
    case 'choice':
      return `${choiceLetter(answer.correct)}. ${answer.options[answer.correct]!}`;
    case 'number':
      return String(answer.value);
    case 'sequence':
      return answer.value.length ? answer.value.join(' ') : '(nothing)';
  }
}
