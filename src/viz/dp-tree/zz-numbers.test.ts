import fs from 'node:fs';
import { it } from 'vitest';
import type { Token } from '../binary-tree/model';
import { naiveCount, pairs, pick, readTree, treeOf } from './model';

it('prints numbers', () => {
  const out: string[] = [];
  for (const list of [
    '4 9 2 1 3 6 4',
    '5 1 _ 1 _ 5',
    '1 2 1 7 8 6 9',
    '7',
    '3 5 2 4 1 6 2 3 _ 4 1',
    '2 7 3 1 _ 8 1',
  ]) {
    const nodes = treeOf(readTree(list) as Token[]);
    const m = pairs(nodes);
    const ch = pick(nodes, m);
    const nc = naiveCount(nodes);
    const levels: number[] = [];
    const depth = (u: number): number =>
      nodes[u]!.parent === null ? 0 : 1 + depth(nodes[u]!.parent!);
    nodes.forEach((v) => (levels[depth(v.uid)] = (levels[depth(v.uid)] ?? 0) + v.value));
    out.push(
      `${list}: ${nodes.map((v, u) => `${v.name}${v.value}(${m[u]![0]},${m[u]![1]})`).join(' ')} best ${Math.max(...m[0]!)} chosen ${ch.map((u) => nodes[u]!.name).join('')} naive ${nc.calls} calls ${nc.subsets} subsets; levels ${levels.join(',')}`,
    );
  }
  fs.writeFileSync(
    '/tmp/claude-0/-home-user-visualizing-data-structures/1519983e-b547-5d17-a070-cca0a9733a2f/scratchpad/_dp3/tree-numbers.txt',
    out.join('\n') + '\n',
  );
});
