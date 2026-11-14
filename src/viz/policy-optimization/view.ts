/**
 * Policy optimization: the prompt, then two tables drawn with the decoding pages' bars
 * (src/viz/_decode/bars.ts).
 *
 * - The answers: each answer's reward, the reference policy π_ref (outlined bars), the policy π
 *   (filled bars), its logit z and the change Δz the current pass makes.
 * - The group: for REINFORCE, PPO and GRPO the four answers drawn, each with the u that drew it,
 *   its reward, its advantage A and, from the second pass, its ratio ρ = π/π_old (a clipped one
 *   in gray); for DPO the preferred and the rejected answer, with u and z − z_ref.
 *
 * A laptop puts the group under the answers (or beside them, if that is larger); a phone splits
 * the answers' columns in two and puts the group last.
 *
 * Shape ids, for marks: r-a<k>, ref-a<k>, pi-a<k>, z-a<k>, dz-a<k> (answer k); gr-g<i>,
 * rw-g<i>, adv-g<i>, rho-g<i>, lr-g<i> (sample i).
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { unionBounds } from '../../layouts/graph';
import { text } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { short } from '../_lm/numbers';
import { drawTable, type Column, type Row } from '../_decode/bars';
import { shadeOf } from '../_matrix/matrix';
import {
  ANSWERS,
  describe,
  G,
  policy,
  PROMPT,
  REF,
  type DpoRec,
  type PoExtra,
  type PoSettings,
  type PoState,
  type RlRec,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

const TRACK = 100;
const ROOM = 44;
const LABEL_W = 100;
const GAP = 26;
const TITLE = 15;

/** Signed, short: +.43, −.1, 0. */
const sgn = (x: number) => {
  const s = short(x);
  return s === '0' || s.startsWith('−') ? s : `+${s}`;
};

function block(id: string, title: string, groups: Column[][], rows: Row[], roles: Roles): Block {
  const t = drawTable(groups, rows, roles, { top: 26, labelW: LABEL_W });
  const shapes = [
    ...t.shapes,
    text(`${id}-head`, { x: 4, y: 16 }, title, { size: TITLE, bold: true, cls: '' }),
  ];
  return { shapes, bounds: unionBounds(t.bounds, { x: 0, y: 0, w: 10, h: 20 }) };
}

function answerColumns(
  s: PoState,
  settings: PoSettings,
  dz: number[] | undefined,
): Record<string, Column> {
  const p = policy(s.z);
  const zTop = Math.max(0, ...s.z.map(Math.abs));
  const rTop = Math.max(0, ...s.rewards.map(Math.abs));
  const dzTop = dz ? Math.max(0, ...dz.map(Math.abs)) : 0;
  void settings;
  return {
    r: {
      kind: 'cells',
      id: 'r',
      title: 'reward',
      w: 64,
      cell: (k) => ({ text: short(s.rewards[k]!), shade: shadeOf(s.rewards[k]!, rTop) }),
    },
    ref: {
      kind: 'bars',
      id: 'ref',
      title: 'π_ref',
      track: TRACK,
      room: ROOM,
      bar: (k) => ({ value: REF[k]!, text: short(REF[k]!), dim: true }),
    },
    pi: {
      kind: 'bars',
      id: 'pi',
      title: 'π',
      track: TRACK,
      room: ROOM,
      bar: (k) => ({ value: p[k]!, text: short(p[k]!) }),
    },
    z: {
      kind: 'cells',
      id: 'z',
      title: 'z',
      cell: (k) => ({ text: short(s.z[k]!), shade: shadeOf(s.z[k]!, zTop) }),
    },
    dz: {
      kind: 'cells',
      id: 'dz',
      title: 'Δz',
      w: 58,
      cell: (k) =>
        dz
          ? { text: sgn(dz[k]!), shade: shadeOf(dz[k]!, dzTop), dim: Math.abs(dz[k]!) < 0.005 }
          : null,
    },
  };
}

function groupBlock(
  rec: RlRec | undefined,
  stage: string,
  pass: number | undefined,
  roles: Roles,
): Block {
  const shown = !!rec;
  const rows: Row[] = Array.from({ length: G }, (_, i) => ({
    key: `g${i}`,
    label: rec ? ANSWERS[rec.draws[i]!.a]! : `sample ${i + 1}`,
  }));
  const advShown = rec && stage !== 'draw';
  const rhoPass = rec ? (stage === 'pass' ? (pass ?? 0) : rec.passes.length - 1) : -1;
  const rhoShown = rec && rec.method !== 'reinforce' && stage !== 'draw' && stage !== 'adv';
  const advTop = rec ? Math.max(0, ...rec.adv.map(Math.abs)) : 0;
  const cols: Column[] = [
    {
      kind: 'cells',
      id: 'gr',
      title: 'u',
      w: 58,
      cell: (i) => (shown ? { text: short(rec!.draws[i]!.u) } : null),
    },
    {
      kind: 'cells',
      id: 'rw',
      title: 'reward',
      w: 64,
      cell: (i) => (shown ? { text: short(rec!.r[i]!) } : null),
    },
    {
      kind: 'cells',
      id: 'adv',
      title: 'A',
      w: 58,
      cell: (i) =>
        advShown ? { text: sgn(rec!.adv[i]!), shade: shadeOf(rec!.adv[i]!, advTop) } : null,
    },
    ...(rec?.method === 'reinforce'
      ? []
      : [
          {
            kind: 'cells' as const,
            id: 'rho',
            title: 'ρ',
            w: 58,
            cell: (i: number) => {
              if (!rhoShown || rhoPass < 0) return null;
              const ps = rec!.passes[rhoPass]!;
              return { text: short(ps.ratio[i]!), dim: ps.clipped[i]! };
            },
          },
        ]),
  ];
  return block('gb', 'the group', [cols], rows, roles);
}

function pairBlock(rec: DpoRec | undefined, roles: Roles): Block {
  const rows: Row[] = [
    { key: 'g0', label: rec ? `≻ ${ANSWERS[rec.w]}` : 'preferred' },
    { key: 'g1', label: rec ? `≺ ${ANSWERS[rec.l]}` : 'rejected' },
  ];
  const us = rec ? rec.draws.slice(-2).map((d) => d.u) : [];
  // The two draws in the order they came; the winner may be either.
  const uOf = (i: number) => {
    if (!rec) return null;
    const last = rec.draws.slice(-2);
    const k = last.findIndex((d) => d.a === (i === 0 ? rec.w : rec.l));
    return us[k < 0 ? i : k]!;
  };
  const cols: Column[] = [
    {
      kind: 'cells',
      id: 'gr',
      title: 'u',
      w: 58,
      cell: (i) => (rec ? { text: short(uOf(i)!) } : null),
    },
    {
      kind: 'cells',
      id: 'lr',
      title: 'z − z_ref',
      w: 84,
      cell: (i) => (rec ? { text: short(i === 0 ? rec.dw : rec.dl) } : null),
    },
  ];
  return block('gb', 'the preference', [cols], rows, roles);
}

export function view(step: Step<PoState, PoExtra>, settings: PoSettings, stage?: StageSize): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const work = step.extra?.work;
  const rec = work?.rec;
  const rl = rec?.kind === 'rl' ? rec : undefined;
  const dpo = rec?.kind === 'dpo' ? rec : undefined;

  let dz: number[] | undefined;
  if (rl && work?.stage === 'pass') dz = rl.passes[work.pass ?? 0]!.dz;
  if (dpo && work?.stage === 'pass')
    dz = ANSWERS.map((_, k) => (k === dpo.w ? dpo.step : k === dpo.l ? -dpo.step : 0));

  const rows: Row[] = ANSWERS.map((a, k) => ({ key: `a${k}`, label: a }));
  const c = answerColumns(state, settings, dz);
  const group =
    settings.method === 'dpo'
      ? pairBlock(dpo, roles)
      : groupBlock(rl, work?.stage ?? 'done', work?.pass, roles);

  const prompt = text('prompt', { x: 4, y: 18 }, `Q: ${PROMPT}`, {
    size: TITLE,
    bold: true,
    cls: '',
  });
  const top = 34;

  const arrange = (answerGroups: Column[][], beside: boolean): Block => {
    const a = block('ab', 'answers', answerGroups, rows, roles);
    const at = translate(a.shapes, 0, top);
    const ab = { ...a.bounds, y: a.bounds.y + top };
    const gx = beside ? ab.x + ab.w + GAP : 0;
    const gy = beside ? top : ab.y + ab.h + 6;
    const g = translate(group.shapes, gx - group.bounds.x, gy - group.bounds.y);
    const gb = { x: gx, y: gy, w: group.bounds.w, h: group.bounds.h };
    return {
      shapes: [prompt, ...at, ...g],
      bounds: unionBounds({ x: -8, y: -6, w: 10, h: 10 }, ab, gb, { x: 0, y: 0, w: 380, h: 24 }),
    };
  };

  const options = [
    arrange([[c.r!, c.ref!, c.pi!, c.z!, c.dz!]], false),
    arrange([[c.r!, c.ref!, c.pi!, c.z!, c.dz!]], true),
    arrange(
      [
        [c.ref!, c.pi!],
        [c.r!, c.z!, c.dz!],
      ],
      false,
    ),
  ];
  const best = pickLayout(stage, options);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(state) };
}
