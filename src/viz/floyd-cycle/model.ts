import type {
  Mark,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { fmt } from '../linked-list/model';

export interface FNode {
  uid: number;
  value: Value;
  next: number | null;
}

export interface FState {
  /** The nodes in list order: node i points at node i + 1, and the last one at loopAt. */
  nodes: FNode[];
  /** The index the last node links back to, or null when the list ends in null. */
  loopAt: number | null;
  nextUid: number;
}

export type FSettings = Record<string, Scalar>;

export interface FExtra {
  /** Where slow and fast are, as node indexes. */
  slow?: number | null;
  fast?: number | null;
}

type S = FState;
type X = FExtra;
type Op = OpSpec<S, FSettings, X>;
type FStep = Step<S, X>;

export const defaults: FSettings = {};
export const MAX_NODES = 10;
const MAX_VALUE = 5;

export function init(): S {
  return { nodes: [], loopAt: null, nextUid: 1 };
}

export const nid = (uid: number) => `n${uid}`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

export interface Spec {
  values: Value[];
  loopAt: number | null;
}

/**
 * Reads "1 2 3 4 5 6 @2": the values in order, then optionally @ and the index the last node
 * links back to. Without @ the list ends in null. Errors are written for the learner.
 */
export function parseSpec(text: string): Spec | Error {
  const t = text.trim().replace(/@\s+/g, '@');
  if (!t) return new Error('Type some values first, like 1 2 3 4 5 @2.');
  const tokens = t.split(/[\s,]+/).filter(Boolean);
  const at = tokens.filter((x) => x.includes('@'));
  if (at.length > 1 || (at.length === 1 && (tokens.at(-1) !== at[0] || !at[0]!.startsWith('@'))))
    return new Error('Put @ and the index at the end, like 1 2 3 4 @1.');
  const raw = at.length ? tokens.slice(0, -1) : tokens;
  if (raw.length === 0) return new Error('Type some values before the @, like 1 2 3 4 @1.');
  if (raw.length > MAX_NODES) return new Error(`Up to ${MAX_NODES} nodes, so the drawing fits.`);
  const long = raw.find((x) => x.length > MAX_VALUE);
  if (long) return new Error(`Keep values to ${MAX_VALUE} characters ("${long}" is longer).`);
  const values = raw.map((x) => (/^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x));
  if (!at.length) return { values, loopAt: null };
  const k = at[0]!.slice(1);
  if (!/^\d+$/.test(k))
    return new Error('After @ goes the index the last node links back to, a whole number.');
  const loopAt = Number(k);
  if (loopAt >= values.length)
    return new Error(
      values.length === 1
        ? 'With one node, the only index to link back to is 0.'
        : `The last node can link back to an index from 0 to ${values.length - 1}.`,
    );
  return { values, loopAt };
}

/** The input box's parser: checks the whole list and hands back a tidy version of it. */
export function parseInput(token: string): Value | Error {
  const spec = parseSpec(token);
  if (spec instanceof Error) return spec;
  return formatSpec(spec);
}

export const formatSpec = (s: Spec) =>
  s.values.map(String).join(' ') + (s.loopAt === null ? '' : ` @${s.loopAt}`);

/** μ (tail length) and λ (cycle length) of a state, or null when there is no cycle. */
export function rho(s: S): { mu: number; lambda: number } | null {
  return s.loopAt === null ? null : { mu: s.loopAt, lambda: s.nodes.length - s.loopAt };
}

const nameAt = (s: S, i: number | null) =>
  i === null ? 'null' : `${fmt(s.nodes[i]!.value)} (index ${i})`;

function st(state: S, say: string, lines: string[], o: Partial<FStep> & { ptr?: X } = {}): FStep {
  return {
    state,
    marks: o.marks ?? [],
    say,
    lines,
    vars: o.vars,
    level: o.level ?? 2,
    extra: o.ptr ?? {},
  };
}

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s0, [x]) {
    const text = x === undefined ? '' : String(x);
    const spec = parseSpec(text);
    if (spec instanceof Error) {
      yield st(
        s0,
        `build(${fmt(text)}): ${spec.message} The list does not change.`,
        ['build.check'],
        {
          marks: [mark('p:head', 'error')],
          level: 1,
        },
      );
      return s0;
    }
    const n = spec.values.length;
    const uid0 = s0.nextUid;
    const nodes: FNode[] = spec.values.map((value, i) => ({
      uid: uid0 + i,
      value,
      next: i + 1 < n ? uid0 + i + 1 : null,
    }));
    const line: S = { nodes, loopAt: null, nextUid: uid0 + n };
    const shown = spec.values.map(fmt).join(' → ');
    yield st(
      line,
      `build(${formatSpec(spec)}): make ${plural(n, 'node')} and link each one to the next: head → ${shown}.`,
      ['build.nodes'],
      { marks: [mark('p:head', 'active')], vars: { n } },
    );
    if (spec.loopAt === null) {
      yield st(line, `The last node's next stays null, so this list has no cycle.`, ['build.end'], {
        marks: [mark(nid(nodes[n - 1]!.uid), 'done')],
        level: 1,
        vars: { n },
      });
      return line;
    }
    const k = spec.loopAt;
    const done: S = {
      ...line,
      loopAt: k,
      nodes: nodes.map((nd, i) => (i === n - 1 ? { ...nd, next: nodes[k]!.uid } : nd)),
    };
    yield st(
      done,
      k === n - 1
        ? `Then point the last node, ${nameAt(done, n - 1)}, back at itself: a cycle of one node.`
        : `Then point the last node, ${nameAt(done, n - 1)}, back at ${nameAt(done, k)}. Following next from head now never reaches null.`,
      ['build.loop'],
      { marks: [mark(`${nid(nodes[n - 1]!.uid)}.next`, 'active')], level: 1, vars: { n } },
    );
    return done;
  },
};

const detect: Op = {
  label: 'Detect cycle',
  arity: 0,
  *run(s) {
    const n = s.nodes.length;
    const next = (i: number) => {
      const u = s.nodes[i]!.next;
      return u === null ? null : s.nodes.findIndex((nd) => nd.uid === u);
    };
    const id = (i: number) => nid(s.nodes[i]!.uid);
    let slow: number | null = n ? 0 : null;
    let fast: number | null = n ? 0 : null;
    let steps = 0;
    const ptr = () => ({ slow, fast });
    const v = (more: Record<string, Scalar> = {}) => ({
      phase: 1,
      slow,
      fast,
      steps,
      ...more,
    });
    const both = (role: Mark['role']) => [mark('p:slow', role), mark('p:fast', role)];

    yield st(
      s,
      n === 0
        ? 'detect(): slow = fast = head, which is null. An empty list has no cycle.'
        : `detect(): phase 1. The tortoise (slow) and the hare (fast) both start at head, ${nameAt(s, 0)}. Each step, slow moves one node and fast moves two.`,
      ['detect.init'],
      { marks: both('active'), ptr: ptr(), vars: v() },
    );

    // Phase 1: run until the pointers meet, or fast runs off the end.
    let met = false;
    while (fast !== null && next(fast) !== null) {
      yield st(s, `fast and fast.next are not null, so keep going.`, ['detect.loop'], {
        ptr: ptr(),
        level: 3,
        vars: v(),
      });
      slow = next(slow!)!;
      steps++;
      yield st(s, `slow = slow.next: the tortoise moves to ${nameAt(s, slow)}.`, ['detect.slow'], {
        marks: [mark('p:slow', 'active'), mark(id(slow), 'visit')],
        ptr: ptr(),
        level: 3,
        vars: v(),
      });
      fast = next(next(fast)!);
      yield st(
        s,
        fast === null
          ? 'fast = fast.next.next, which is null: the hare ran off the end.'
          : `fast = fast.next.next: the hare jumps two nodes, to ${nameAt(s, fast)}. Step ${steps}.`,
        ['detect.fast'],
        { marks: [mark('p:fast', 'active')], ptr: ptr(), vars: v() },
      );
      if (fast !== null && slow === fast) {
        met = true;
        yield st(
          s,
          `slow == fast: they meet at ${nameAt(s, slow)} after ${plural(steps, 'step')}. A list without a cycle could never bring them together, so there is a cycle.`,
          ['detect.meet'],
          { marks: [...both('found'), mark(id(slow), 'found')], ptr: ptr(), level: 1, vars: v() },
        );
        break;
      }
      if (fast !== null) {
        yield st(
          s,
          `slow == fast? No: slow is at index ${slow} and fast at index ${fast}.`,
          ['detect.meet'],
          {
            ptr: ptr(),
            level: 3,
            vars: v(),
          },
        );
      }
    }
    if (!met) {
      const why =
        fast === null
          ? 'fast is null, so the hare ran off the end of the list'
          : `fast.next is null: ${nameAt(s, fast)} is the last node, so the hare cannot take two more steps`;
      yield st(
        s,
        n === 0
          ? 'head is null: there is no list to walk, so there is no cycle. Return null.'
          : `${why}. A list with a cycle has no end, so there is no cycle. That took ${plural(steps, 'step')}. Return null.`,
        ['detect.loop', 'detect.none'],
        { marks: [mark('p:fast', 'done')], ptr: ptr(), level: 1, vars: v({ cycle: false }) },
      );
      return s;
    }

    // Phase 2: from head and from the meeting point, at the same speed, to the cycle's start.
    slow = 0;
    let mu = 0;
    const v2 = () => ({ phase: 2, slow, fast, steps, μ: mu });
    yield st(
      s,
      `Phase 2: put slow back at head and leave fast at the meeting point. Now both move one node at a time. The start of the cycle is the same distance from both, so they will meet there.`,
      ['detect.reset'],
      { marks: [mark('p:slow', 'active')], ptr: ptr(), vars: v2() },
    );
    while (slow !== fast) {
      yield st(s, `slow != fast, so keep going.`, ['detect.find'], {
        ptr: ptr(),
        level: 3,
        vars: v2(),
      });
      slow = next(slow!)!;
      fast = next(fast!)!;
      mu++;
      yield st(
        s,
        `Both move one node: slow to index ${slow}, fast to index ${fast}. μ = ${mu}.`,
        ['detect.step2', 'detect.mu'],
        { marks: both('active'), ptr: ptr(), vars: v2() },
      );
    }
    yield st(
      s,
      mu === 0
        ? `slow == fast already, at head: the cycle starts at index 0, so the tail is empty. μ = 0.`
        : `slow == fast at ${nameAt(s, slow)}: that is where the cycle starts. The tail before it is μ = ${plural(mu, 'node')} long.`,
      ['detect.find'],
      { marks: [...both('found'), mark(id(slow!), 'found')], ptr: ptr(), level: 1, vars: v2() },
    );

    // Phase 3: walk fast once around to measure the cycle.
    let lambda = 1;
    fast = next(slow!)!;
    const v3 = () => ({ phase: 3, slow, fast, steps, μ: mu, λ: lambda });
    yield st(
      s,
      fast === slow
        ? `Phase 3: fast = slow.next, which is slow itself. The cycle is one node long.`
        : `Phase 3: leave slow at the start of the cycle and walk fast around once, counting. fast = slow.next, ${nameAt(s, fast)}: λ = 1 so far.`,
      ['detect.len', 'detect.ahead'],
      { marks: [mark('p:fast', 'active')], ptr: ptr(), vars: v3() },
    );
    while (fast !== slow) {
      fast = next(fast!)!;
      lambda++;
      yield st(
        s,
        fast === slow
          ? `fast = fast.next: fast is back at slow.`
          : `fast = fast.next: fast moves to ${nameAt(s, fast)}. λ = ${lambda}.`,
        ['detect.around', 'detect.count'],
        { marks: [mark('p:fast', 'active')], ptr: ptr(), level: fast === slow ? 2 : 3, vars: v3() },
      );
    }
    yield st(
      s,
      `Cycle found: the tail is μ = ${mu} and the cycle is λ = ${plural(lambda, 'node')} long. Phase 1 took ${plural(steps, 'step')}, and the whole search used two pointers and no extra memory.`,
      ['detect.return'],
      {
        marks: [mark(id(slow!), 'found')],
        ptr: ptr(),
        level: 1,
        vars: { ...v3(), cycle: true },
      },
    );
    return s;
  },
};

export const ops = { build, detect };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'build',
      lines: [
        L('build.sig', 0, 'build(values, k)', 'To build the list:'),
        L('build.check', 1, 'check the values and k', 'Make sure the input makes sense.'),
        L('build.nodes', 1, 'link node i to node i + 1', 'Chain the nodes in order.'),
        L('build.loop', 1, 'last.next = node k', 'The last node points back to node k,'),
        L('build.end', 1, '(or last.next = null)', 'or, with no k, to nothing.'),
      ],
    },
    {
      op: 'detect',
      lines: [
        L('detect.sig', 0, 'detect(head)', 'To find a cycle with two pointers:'),
        L('detect.init', 1, 'slow = head; fast = head', 'Start both at the first node.'),
        L(
          'detect.loop',
          1,
          'while fast != null and fast.next != null',
          'While the hare can take two steps:',
        ),
        L('detect.slow', 2, 'slow = slow.next', 'the tortoise moves one node,'),
        L('detect.fast', 2, 'fast = fast.next.next', 'the hare moves two;'),
        L('detect.meet', 2, 'if slow == fast: break', 'if they land on the same node, stop.'),
        L(
          'detect.none',
          1,
          'if no meeting: return null',
          'If the hare reached the end, there is no cycle.',
        ),
        L('detect.reset', 1, 'slow = head; mu = 0', 'Put the tortoise back at the first node.'),
        L('detect.find', 1, 'while slow != fast', 'Until they meet again,'),
        L('detect.step2', 2, 'slow = slow.next; fast = fast.next', 'move both one node'),
        L('detect.mu', 2, 'mu = mu + 1', 'and count: that is the tail length.'),
        L('detect.len', 1, 'lambda = 1', 'Now measure the cycle:'),
        L('detect.ahead', 1, 'fast = slow.next', 'start the hare one node past the start,'),
        L('detect.around', 1, 'while fast != slow', 'and until it is back at the start,'),
        L('detect.count', 2, 'fast = fast.next; lambda = lambda + 1', 'move it and count.'),
        L(
          'detect.return',
          1,
          'return (mu, lambda)',
          'Hand back where the cycle starts and its length.',
        ),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'An empty list. Type the values and, after @, the index the last node links back to (for example 1 2 3 4 5 6 @2), then press Build.';
}

export function describe(state: S): string {
  const n = state.nodes.length;
  if (n === 0) return 'Empty list: head is null.';
  const vals = state.nodes.map((nd) => fmt(nd.value)).join(' → ');
  const r = rho(state);
  return r
    ? `List of ${plural(n, 'node')}: ${vals}, and the last node links back to index ${r.mu}. Tail μ = ${r.mu}, cycle λ = ${r.lambda}.`
    : `List of ${plural(n, 'node')}: ${vals} → null. No cycle.`;
}
