import type { Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { trieScene } from '../_trie/scene';
import {
  describe,
  heightOf,
  spell,
  type RadixExtra,
  type RadixSettings,
  type RadixState,
} from './model';

export function view(step: Step<RadixState, RadixExtra>, _settings?: RadixSettings): Scene {
  const s = step.state;
  return trieScene(s, step.marks, step.extra, {
    label: (u) => s.nodes[u]!.label,
    spell: (u) => spell(s, u),
    height: heightOf(s),
    describe: describe(s),
    empty: 'empty compressed trie',
  });
}
