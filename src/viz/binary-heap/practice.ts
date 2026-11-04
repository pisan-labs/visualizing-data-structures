import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { nodeShapeId } from '../../layouts/binary-tree';
import { conv, defaults, type HeapExtra, type HeapSettings, type HeapState } from './model';

type Def = VizDef<HeapState, HeapSettings, HeapExtra>;
type HeapStep = Step<HeapState, HeapExtra>;

function distinct(rng: Rng, n: number, avoid: number[] = []): number[] {
  const out = new Set<number>();
  while (out.size < n) {
    const k = rng.int(1, 99);
    if (!avoid.includes(k)) out.add(k);
  }
  return [...out];
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** "a", "a and b", "a, b and c". */
const and = (xs: (string | number)[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** A heap kind and indexing picked at random, so practice covers every convention. */
function randomSettings(rng: Rng): HeapSettings {
  return {
    ...defaults,
    order: rng.int(0, 2) ? 'max' : 'min',
    index: rng.int(0, 1) ? 'one' : 'zero',
  };
}

function heapName(st: HeapSettings): string {
  const K = conv(st);
  return `${K.kind} indexed from ${K.base}`;
}

/** The keys a sift swapped with, in order, read from the steps the model yields. */
function swappedWith(steps: HeapStep[], swapLine: string): number[] {
  const out: number[] = [];
  for (const st of steps) {
    if (!st.lines.includes(swapLine)) continue;
    const m = st.marks.find((x) => x.role === 'visit');
    const uid = m ? Number(m.id.slice(nodeShapeId('').length)) : NaN;
    const item = st.state.items.find((x) => x.uid === uid);
    if (item) out.push(item.key);
  }
  return out;
}

/**
 * Practice questions for binary heaps. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function binaryHeapPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: HeapSettings) => new Timeline(def(), settings, 1, cs);
  /** The steps of the last operation. */
  const lastOp = (cs: OpCall[], settings: HeapSettings): HeapStep[] => {
    const t = run(cs, settings);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const randomHeap = (rng: Rng, lo: number, hi: number): { keys: number[]; setup: OpCall[] } => {
    const keys = distinct(rng, rng.int(lo, hi));
    return { keys, setup: [['build', keys.join(' ')]] };
  };

  return [
    {
      id: 'insert-index',
      title: 'Where does the new key end up?',
      make(rng) {
        const settings = randomSettings(rng);
        const K = conv(settings);
        const { keys, setup } = randomHeap(rng, 6, 9);
        const k = distinct(rng, 1, keys)[0]!;
        const steps = lastOp([...setup, ['insert', k]], settings);
        const end = steps[steps.length - 1]!.state;
        const at = end.items.findIndex((x) => x.key === k);
        const start = K.ix(end.items.length - 1);
        const passed = swappedWith(steps, 'up.swap');
        return {
          prompt: `The picture shows a ${heapName(settings)}. Insert \`${k}\`. At which index of A does ${k} end up?`,
          setup,
          settings,
          answer: { kind: 'number', value: K.ix(at) },
          explain: passed.length
            ? `${k} starts in the first free slot, A[${start}], and swaps with ${and(passed)} on the way up. It stops at A[${K.ix(at)}].`
            : `${k} goes in the first free slot, A[${start}]. Its parent already ${K.max ? 'is at least as big' : 'is no bigger'}, so it stays there.`,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'extract-array',
      title: 'What does the array look like after an extract?',
      make(rng) {
        const settings = randomSettings(rng);
        const K = conv(settings);
        const { setup } = randomHeap(rng, 5, 8);
        const steps = lastOp([...setup, ['extract']], settings);
        const before = steps[0]!.state.items;
        const after = steps[steps.length - 1]!.state.items.map((x) => String(x.key));
        const last = before[before.length - 1]!.key;
        const passed = swappedWith(steps, 'hfy.swap');
        const range = K.range(after.length);
        return {
          prompt: `Run \`${K.extract}()\` on the ${heapName(settings)} shown. Type the array afterwards, ${range}, separated by spaces.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: after },
          explain: `The root, ${before[0]!.key}, comes out. The last key, ${last}, moves into the root${
            passed.length
              ? ` and sinks: it swaps with ${and(passed)}, always the ${K.larger} child.`
              : ' and already beats its children, so it stays.'
          } The array is \`${after.join(' ')}\`.`,
          watch: [['extract']],
        };
      },
    },
    {
      id: 'build-swaps',
      title: 'How many swaps does bottom-up build make?',
      make(rng) {
        const settings: HeapSettings = { ...randomSettings(rng), build: 'bottom-up' };
        const K = conv(settings);
        const keys = distinct(rng, rng.int(6, 9));
        const list = keys.join(' ');
        const setup: OpCall[] = [['build', list]];
        const steps = lastOp(setup, settings);
        const swaps = Number(steps[steps.length - 1]!.vars?.swaps);
        const n = keys.length;
        const from =
          K.base === 1 ? `⌊n/2⌋ = ${Math.floor(n / 2)}` : `⌊n/2⌋ − 1 = ${Math.floor(n / 2) - 1}`;
        return {
          prompt: `Building a ${heapName(settings)} bottom-up from the list \`${list}\` gives the heap shown. How many swaps did the build make?`,
          setup,
          settings,
          answer: { kind: 'number', value: swaps },
          explain: `Copy the list into A, then sift down every key from i = ${from} back to the root. Counting every swap of every sift-down gives ${swaps}.`,
          watch: [['build', list]],
        };
      },
    },
    {
      id: 'update-direction',
      title: 'Which way does the changed key move?',
      make(rng) {
        const settings = randomSettings(rng);
        const K = conv(settings);
        const { keys, setup } = randomHeap(rng, 6, 9);
        const p = rng.int(0, keys.length - 1);
        const k = distinct(rng, 1, keys)[0]!;
        const steps = lastOp([...setup, ['update', K.ix(p), k]], settings);
        const old = Number(steps[0]!.vars?.old);
        const end = steps[steps.length - 1]!.state.items;
        const at = end.findIndex((x) => x.key === k);
        const moves = ['Up, toward the root', 'Down, toward the leaves', 'Nowhere: it stays put'];
        const right = moves[at < p ? 0 : at > p ? 1 : 2]!;
        const options = shuffle(rng, moves);
        const dir = K.beats(k, old) ? 'up' : 'down';
        const why =
          at === p
            ? `${k} still fits between its parent and its children, so it stays at A[${K.ix(p)}].`
            : `It ends at A[${K.ix(at)}].`;
        return {
          prompt: `In the ${heapName(settings)} shown, \`updateKey(${K.ix(p)}, ${k})\` changes A[${K.ix(p)}] from ${old} to ${k}. Which way does ${k} move?`,
          setup,
          settings,
          answer: { kind: 'choice', options, correct: options.indexOf(right) },
          explain: `In a ${K.kind}, a key that ${K.max ? 'grows' : 'shrinks'} can only move up, and one that ${K.max ? 'shrinks' : 'grows'} can only move down. ${old} → ${k} means it can only move ${dir}. ${why}`,
          watch: [['update', K.ix(p), k]],
        };
      },
    },
  ];
}
