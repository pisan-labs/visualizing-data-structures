import type { Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { trieScene } from '../_trie/scene';
import {
  describe,
  heightOf,
  prefixOf,
  type TrieExtra,
  type TrieSettings,
  type TrieState,
} from './model';

export function view(step: Step<TrieState, TrieExtra>, _settings?: TrieSettings): Scene {
  const s = step.state;
  return trieScene(s, step.marks, step.extra, {
    label: (u) => s.nodes[u]!.ch,
    spell: (u) => prefixOf(s, u),
    height: heightOf(s),
    describe: describe(s),
    empty: 'empty trie',
  });
}
