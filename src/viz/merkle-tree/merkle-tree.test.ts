import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { merkleTree } from '.';
import { hash, type MerkleSettings } from './model';

const settings = (s: Partial<MerkleSettings> = {}): MerkleSettings =>
  ({ ...merkleTree.defaults, ...s }) as MerkleSettings;

/**
 * The root, by splitting the list instead of pairing level by level: a tree of height h holds
 * up to 2^h blocks, its left subtree takes the first 2^(h − 1) and its right subtree the rest. A
 * subtree with nothing on its right is the odd node out: promoted as is, or hashed with itself.
 */
function refRoot(blocks: string[], odd: 'promote' | 'duplicate'): string {
  const root = (part: string[], height: number): string => {
    if (height === 0) return hash(part[0]!);
    const half = 2 ** (height - 1);
    const left = root(part.slice(0, half), height - 1);
    if (part.length > half) return hash(left + root(part.slice(half), height - 1));
    return odd === 'duplicate' ? hash(left + left) : left;
  };
  return root(blocks, Math.ceil(Math.log2(blocks.length)));
}

describe('merkle tree', () => {
  it('uses FNV-1a folded to 16 bits', () => {
    // FNV-1a("") = 0x811c9dc5 -> 0x811c ^ 0x9dc5 = 0x1cd9; FNV-1a("a") = 0xe40c292c -> 0xcd20.
    expect(hash('')).toBe('1cd9');
    expect(hash('a')).toBe('cd20');
  });

  it('accepts a real proof and rejects a forged one', () => {
    const t = new Timeline(merkleTree, settings(), 1, [
      ['build', 'a b c d e'],
      ['prove', 4],
      ['verify', 1, 'x'],
    ]);
    expect(t.entries[1]!.steps.at(-1)!.vars?.verified).toBe('yes');
    expect(t.entries[2]!.steps.at(-1)!.vars?.verified).toBe('no');
    // prove names the block it proves, instead of "block 4 is block 4".
    expect(t.entries[1]!.steps[0]!.say).toContain('to show that block 4, "e", is in the tree');
    expect(t.entries[2]!.steps[0]!.say).toContain('to show that "x" is block 1');
  });

  it('matches the definition after any edits, and every proof checks out', () => {
    const data = fc.stringMatching(/^[a-z0-9]{1,6}$/);
    const call = fc.oneof(
      fc.array(data, { minLength: 1, maxLength: 8 }).map((ds) => ['build', ds.join(' ')] as OpCall),
      fc.tuple(fc.integer({ min: -1, max: 8 }), data).map(([i, d]) => ['update', i, d] as OpCall),
      data.map((d) => ['append', d] as OpCall),
      fc.integer({ min: -1, max: 8 }).map((i) => ['prove', i] as OpCall),
    );
    fc.assert(
      fc.property(
        fc.constantFrom('promote' as const, 'duplicate' as const),
        fc.array(call, { maxLength: 20 }),
        (odd, calls) => {
          const t = new Timeline(merkleTree, settings({ odd }), 1, calls);
          let ref: string[] = [];
          calls.forEach((c, k) => {
            const [op, a, b] = c;
            if (op === 'build') ref = String(a).split(' ');
            if (op === 'update' && Number(a) >= 0 && Number(a) < ref.length)
              ref[Number(a)] = String(b);
            if (op === 'append' && ref.length < 8) ref.push(String(a));
            const end = t.entries[k]!.end;
            expect(end.blocks.map((x) => x.data)).toEqual(ref);
            if (ref.length) expect(end.hashes.at(-1)![0]).toBe(refRoot(ref, odd));
            if (op === 'prove' && Number(a) >= 0 && Number(a) < ref.length)
              expect(t.entries[k]!.steps.at(-1)!.vars?.verified).toBe('yes');
          });
          for (let i = 0; i < t.length; i++) {
            const st = t.at(i).step.state;
            expect(st.hashes[0]?.length ?? 0).toBe(st.blocks.length);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('drawn text size', () => {
  // The block numbers are the smallest text: 15 px on a laptop, 9.9 on a phone for eight blocks.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(merkleTree, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(13);
    expect(smallestText(merkleTree, PHONE_STAGE).px).toBeGreaterThanOrEqual(9.5);
  });
});
