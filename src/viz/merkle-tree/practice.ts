import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, type MerkleExtra, type MerkleSettings, type MerkleState } from './model';

type Def = VizDef<MerkleState, MerkleSettings, MerkleExtra>;

/** Blocks named tx1, tx2, ..., some with other data, so every tree looks different. */
function blocksOf(rng: Rng): string[] {
  const n = rng.int(4, 8);
  return Array.from({ length: n }, (_, i) =>
    rng.int(0, 2) ? `tx${i + 1}` : `d${rng.int(10, 99)}`,
  );
}

/**
 * Practice for Merkle trees. Every answer comes from running the model. `def` is a getter to
 * avoid an import cycle.
 */
export function merklePractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const lastOf = (cs: OpCall[]) => run(cs).entries.at(-1)!.steps.at(-1)!;

  return [
    {
      id: 'proof-size',
      title: 'How many hashes are in the proof?',
      make(rng) {
        const blocks = blocksOf(rng);
        const setup: OpCall[] = [['build', blocks.join(' ')]];
        const i = rng.int(0, blocks.length - 1);
        const last = lastOf([...setup, ['prove', i]]);
        const size = Number(last.vars?.['proof size']);
        return {
          prompt: `How many sibling hashes does the inclusion proof for block ${i} hold?`,
          setup,
          answer: { kind: 'number', value: size },
          explain: `One sibling per level on the path from leaf ${i} to the root, except where a node had no partner and moved up as it was: ${size}.`,
          watch: [['prove', i]],
        };
      },
    },
    {
      id: 'rehash-count',
      title: 'How many hashes does a change cost?',
      make(rng) {
        const blocks = blocksOf(rng);
        const setup: OpCall[] = [['build', blocks.join(' ')]];
        const i = rng.int(0, blocks.length - 1);
        const last = lastOf([...setup, ['update', i, 'evil']]);
        const n = Number(last.vars?.['hashes computed']);
        return {
          prompt: `Run \`update(${i}, evil)\`. How many hashes are computed again, the leaf's included?`,
          setup,
          answer: { kind: 'number', value: n },
          explain: `The leaf, then each parent on the way up whose children changed. A node with no partner moves up without a new hash. That makes ${n}.`,
          watch: [['update', i, 'evil']],
        };
      },
    },
    {
      id: 'proof-hashes',
      title: 'Read the proof off the tree',
      make(rng) {
        const blocks = blocksOf(rng);
        const setup: OpCall[] = [['build', blocks.join(' ')]];
        const i = rng.int(0, blocks.length - 1);
        const last = lastOf([...setup, ['prove', i]]);
        const items = (last.extra?.proof?.items ?? [])
          .filter((it) => it.side !== null)
          .map((it) => it.hash);
        return {
          prompt: `Type the hashes of the inclusion proof for block ${i}, from the leaf level up. Leave it blank if there are none.`,
          setup,
          answer: { kind: 'sequence', value: items },
          explain: items.length
            ? `The siblings of the nodes on the path from leaf ${i} to the root: ${items.join(', ')}.`
            : 'The path has no siblings, so the proof is empty.',
          watch: [['prove', i]],
        };
      },
    },
    {
      id: 'claim',
      title: 'Is the claim accepted?',
      make(rng) {
        const blocks = blocksOf(rng);
        const setup: OpCall[] = [['build', blocks.join(' ')]];
        const i = rng.int(0, blocks.length - 1);
        const data = rng.int(0, 1) ? blocks[i]! : blocks[(i + 1) % blocks.length]!;
        const last = lastOf([...setup, ['verify', i, data]]);
        const ok = last.vars?.verified === 'yes';
        const options = ['Accepted', 'Rejected'];
        return {
          prompt: `Someone claims block ${i} is "${data}" and sends the proof for block ${i}. Does checking it against the root accept the claim?`,
          setup,
          answer: { kind: 'choice', options, correct: ok ? 0 : 1 },
          explain: ok
            ? `Block ${i} really is "${data}", so hashing it up with the proof lands on the root.`
            : `Block ${i} is "${blocks[i]}", not "${data}" (unless the two are equal), so the hashes climb to a value that is not the root.`,
          watch: [['verify', i, data]],
        };
      },
    },
  ];
}
