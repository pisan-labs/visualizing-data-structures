import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import { outlier, randomWeights } from './weights';
import {
  COLS,
  errorStats,
  groupName,
  groupOfCell,
  qmaxOf,
  roundHalfAway,
  ROWS,
  sig3,
  type Bits,
  type Grouping,
  type QuantSettings,
  type QuantState,
  type Scheme,
} from './model';

type Def = VizDef<QuantState, QuantSettings, unknown>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const text = (xs: readonly number[]) => xs.map(String).join(' ');
const three = (x: number) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(3);
/** A whole number with a real minus sign. */
const int = (n: number) => (n < 0 ? `−${-n}` : String(n));
/** A signed number as it follows a minus: −0.17 in brackets. */
const after = (t: string) => (t.startsWith('−') ? `(${t})` : t);

function rules(settings: QuantSettings): string {
  const qmax = qmaxOf(settings);
  const where =
    settings.group === 'tensor'
      ? 'one scale for the whole matrix'
      : settings.group === 'row'
        ? 'one scale per row'
        : 'one scale per block of 3 in a row (columns 1 to 3 and 4 to 6)';
  return settings.scheme === 'absmax'
    ? `${settings.bits}-bit absmax, ${where}: s = ${qmax} / (the largest |w| in the group), q = round(s · w), ŵ = q / s. Round halves away from 0.`
    : `${settings.bits}-bit zero-point, ${where}: s = ${qmax} / (max − min of the group, with 0 in the range), z = round(−min · s), q = round(s · w) + z (kept within 0 to ${qmax}), ŵ = (q − z) / s.`;
}

/**
 * Practice for quantization. The picture shows the weights after Load (and an outlier, if the
 * question has one); the questions ask what Quantize gives. Every answer comes from the model.
 */
export function quantPractice(def: () => Def): PracticeKind[] {
  const run = (settings: QuantSettings, calls: OpCall[]) =>
    new Timeline(def(), settings, 1, calls).endState();

  function setup(rng: Rng, settings: QuantSettings, withOutlier = rng.int(0, 2) === 0) {
    const calls: OpCall[] = [['load', text(randomWeights(rng))]];
    if (withOutlier) calls.push(['set', ...outlier(rng)]);
    return calls;
  }

  const settingsOf = (rng: Rng): QuantSettings => ({
    bits: pick<Bits>(rng, ['8', '4', '4']),
    scheme: pick<Scheme>(rng, ['absmax', 'absmax', 'zeropoint']),
    group: pick<Grouping>(rng, ['tensor', 'row', '3']),
  });

  /** A weight that is not the largest of its group, so its code is not just the top code. */
  function weight(rng: Rng, s: QuantState) {
    const cells: [number, number][] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const g = groupOfCell(s, r, c)!;
        const x = s.w![r]![c]!;
        if (x !== 0 && Math.abs(x) !== g.hi && x !== g.lo) cells.push([r, c]);
      }
    const [r, c] = cells.length ? pick(rng, cells) : [0, 0];
    return { r, c, x: s.w![r]![c]!, g: groupOfCell(s, r, c)!, q: s.q[r]![c]!, d: s.deq![r]![c]! };
  }

  function question(rng: Rng) {
    const settings = settingsOf(rng);
    const calls = setup(rng, settings);
    const end = run(settings, [...calls, ['quantize']]);
    const p = weight(rng, end);
    const where = groupName(p.g, settings);
    const scale =
      settings.scheme === 'absmax'
        ? `The largest |w| in ${where} is ${two(p.g.hi)}, so s = ${qmaxOf(settings)} / ${two(p.g.hi)} = ${sig3(p.g.s)}.`
        : `${where[0]!.toUpperCase()}${where.slice(1)} runs from ${two(p.g.lo)} to ${two(p.g.hi)}, so s = ${qmaxOf(settings)} / ${two(p.g.hi - p.g.lo)} = ${sig3(p.g.s)} and z = ${p.g.z}.`;
    const name = `the weight in row ${p.r + 1}, column ${p.c + 1} (${two(p.x)})`;
    return { settings, calls, end, p, scale, name, watch: [['quantize']] as OpCall[] };
  }

  return [
    {
      id: 'code',
      title: 'The code for a weight',
      make(rng) {
        const { settings, calls, p, scale, name, watch } = question(rng);
        return {
          prompt: `What code does ${name} get? ${rules(settings)}`,
          setup: calls,
          settings,
          answer: { kind: 'number', value: p.q },
          explain: `${scale} ${settings.scheme === 'absmax' ? `s · w = ${two(p.g.s * p.x)}, which rounds to ${int(p.q)}.` : `s · w = ${two(p.g.s * p.x)} rounds to ${int(roundHalfAway(p.g.s * p.x))}; adding z ${roundHalfAway(p.g.s * p.x) + p.g.z === p.q ? 'gives' : 'and keeping it within range gives'} ${int(p.q)}.`}`,
          watch,
        };
      },
    },
    {
      id: 'decode',
      title: 'The value a code decodes to',
      make(rng) {
        const { settings, calls, p, scale, name, watch } = question(rng);
        return {
          prompt: `After quantizing, what does ${name} decode to? Three decimals. ${rules(settings)}`,
          setup: calls,
          settings,
          answer: { kind: 'number', value: p.d, tolerance: 0.001 },
          explain: `${scale} Its code is ${int(p.q)}, so ŵ = ${settings.scheme === 'absmax' ? `${int(p.q)} / ${sig3(p.g.s)}` : `(${int(p.q)} − ${p.g.z}) / ${sig3(p.g.s)}`} = ${three(p.d)}.`,
          watch,
        };
      },
    },
    {
      id: 'error',
      title: 'The error for a weight',
      make(rng) {
        const { settings, calls, p, scale, name, watch } = question(rng);
        return {
          prompt: `What is the error ŵ − w for ${name}? Three decimals, with its sign. ${rules(settings)}`,
          setup: calls,
          settings,
          answer: { kind: 'number', value: p.d - p.x, tolerance: 0.001 },
          explain: `${scale} Its code is ${int(p.q)}, which decodes to ${three(p.d)}. The error is ${three(p.d)} − ${after(two(p.x))} = ${three(p.d - p.x)}, within half a step, 1 / (2s) = ${three(1 / (2 * p.g.s))}.`,
          watch,
        };
      },
    },
    {
      id: 'lost',
      title: 'Weights lost to an outlier',
      make(rng) {
        const settings: QuantSettings = {
          bits: '4',
          scheme: 'absmax',
          group: pick<Grouping>(rng, ['tensor', 'tensor', 'row']),
        };
        const calls = setup(rng, settings, true);
        const end = run(settings, [...calls, ['quantize']]);
        const e = errorStats(end)!;
        const big = Math.max(...end.w!.flat().map(Math.abs));
        return {
          prompt: `One weight is an outlier. How many weights that are not 0 decode to exactly 0? ${rules(settings)}`,
          setup: calls,
          settings,
          answer: { kind: 'number', value: e.zeroed },
          explain:
            settings.group === 'tensor'
              ? `The outlier sets the one scale: s = 7 / ${two(big)} = ${sig3(7 / big)}, a step of ${three(big / 7)}. A weight smaller than half a step, ${three(big / 14)}, rounds to code 0: ${e.zeroed} of them do.`
              : `Only the outlier's row gets the large step; in the other rows the scale comes from their own largest weight. ${e.zeroed} ${e.zeroed === 1 ? 'weight rounds' : 'weights round'} to code 0.`,
          watch: [['quantize']],
        };
      },
    },
  ];
}
