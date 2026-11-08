import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { distinctKeys, shuffle } from '../_hashing/hashing';
import {
  keyPos,
  nodes,
  nodePos,
  ownerOf,
  SERVER_NAMES,
  type RingExtra,
  type RingSettings,
  type RingState,
} from './model';

type Def = VizDef<RingState, RingSettings, RingExtra>;
type T = Timeline<RingState, RingSettings, RingExtra>;

const settings: RingSettings = { vnodes: 1 };

/**
 * Practice for consistent hashing (one node per server, so every answer is a short walk). Every
 * answer comes from running the model. `def` is a getter to avoid an import cycle.
 */
export function ringPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]): T => new Timeline(def(), settings, 1, cs);
  const lastStep = (t: T) => t.entries[t.entries.length - 1]!.steps.at(-1)!;

  function ring(rng: Rng, n: number) {
    const servers = shuffle(rng.next, [...SERVER_NAMES.slice(0, 6)])
      .slice(0, n)
      .sort();
    const keys = distinctKeys(rng, rng.int(5, 8));
    const setup: OpCall[] = [
      ...servers.map((s): OpCall => ['addServer', s]),
      ...keys.map((k): OpCall => ['addKey', k]),
    ];
    const where = nodes(servers, 1)
      .map((x) => `${x.label} at ${x.pos}`)
      .join(', ');
    return { servers, keys, setup, where };
  }

  return [
    {
      id: 'owner',
      title: 'Which server?',
      make(rng) {
        const { servers, keys, setup, where } = ring(rng, 3);
        let k = rng.int(0, 999);
        while (keys.includes(k)) k++;
        const t = run([...setup, ['lookup', k]]);
        const server = String(lastStep(t).vars!.server);
        return {
          prompt: `The nodes are ${where}. h(${k}) = ${keyPos(k).value}. Which server holds ${k}?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options: servers, correct: servers.indexOf(server) },
          explain: `Walk clockwise from ${keyPos(k).value} (past 359 back to 0 if needed). The first node is ${server}'s.`,
          watch: [['lookup', k]],
        };
      },
    },
    {
      id: 'moved',
      title: 'How many keys move?',
      make(rng) {
        const { servers, keys, setup, where } = ring(rng, 3);
        const added = [...SERVER_NAMES.slice(0, 6)].find((s) => !servers.includes(s))!;
        const t = run([...setup, ['addServer', added]]);
        const moved = Number(lastStep(t).vars!.moved);
        const positions = keys.map((k) => keyPos(k).value).join(', ');
        return {
          prompt: `The nodes are ${where}, and the keys sit at positions ${positions}. Server ${added} joins at position ${nodePos(added, 0).value}. How many keys change server?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: moved },
          explain: `Only keys between the node before ${added} (counter-clockwise) and ${added}'s own position move, all to ${added}: ${moved} of ${keys.length}.`,
          watch: [['addServer', added]],
        };
      },
    },
    {
      id: 'removed',
      title: 'Where do the keys go?',
      make(rng) {
        const { servers, setup, where } = ring(rng, 4);
        const gone = servers[rng.int(0, servers.length - 1)]!;
        const t = run([...setup, ['removeServer', gone]]);
        const end = t.endState();
        const before = t.entries[setup.length - 1]!.end;
        const heir =
          nodes(end.servers, 1).find((n) => n.pos >= nodePos(gone, 0).value) ??
          nodes(end.servers, 1)[0]!;
        const options = servers.filter((s) => s !== gone);
        const movedKeys = before.keys.filter((x) => ownerOf(before, x.key) === gone).length;
        return {
          prompt: `The nodes are ${where}. Server ${gone} leaves. Which server takes over its keys?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'choice', options, correct: options.indexOf(heir.server) },
          explain: `${gone}'s keys sat just counter-clockwise of its node. With ${gone} gone, the next node clockwise is ${heir.label}'s, so ${heir.server} takes them (${movedKeys} here). No other key moves.`,
          watch: [['removeServer', gone]],
        };
      },
    },
    {
      id: 'mod-n',
      title: 'Compared with mod N',
      make(rng) {
        const { servers, keys, setup } = ring(rng, 3);
        const added = [...SERVER_NAMES.slice(0, 6)].find((s) => !servers.includes(s))!;
        const t = run([...setup, ['addServer', added]]);
        const naive = Number(lastStep(t).vars!['mod-N moved']);
        const hs = keys.map((k) => keyPos(k).value);
        const after = [...servers, added].sort();
        return {
          prompt: `Instead of a ring, put key k on server number h(k) mod N, with the servers in alphabetical order (${servers.join(', ')}). The keys hash to ${hs.join(', ')}. When ${added} joins (N goes from 3 to 4, order ${after.join(', ')}), how many keys change server?`,
          setup,
          settings: settings as Settings,
          answer: { kind: 'number', value: naive },
          explain: `A key stays only if h(k) mod 3 and h(k) mod 4 pick the same server. Here ${naive} of ${keys.length} keys move; the ring moved ${lastStep(t).vars!.moved}.`,
          watch: [['addServer', added]],
        };
      },
    },
  ];
}
