import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import type { OpCall } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { prefixCache, treeLine } from '.';
import {
  cachedTokens,
  evictOrder,
  matchLength,
  MAX_RUNNING,
  parsePrompt,
  pathUp,
  ROOT,
  spell,
  type PrefixSettings,
  type PrefixState,
} from './model';

/** Every token sequence the tree spells from the root to a leaf. */
function leafPaths(s: PrefixState): string[][] {
  return Object.values(s.nodes)
    .filter((n) => n.uid !== ROOT && n.kids.length === 0)
    .map((n) => spell(s, n.uid));
}

/** The longest prefix of `tokens` that some cached path starts with, found without the tree. */
function referenceMatch(s: PrefixState, tokens: readonly string[]): number {
  let best = 0;
  for (const p of leafPaths(s)) {
    let k = 0;
    while (k < p.length && k < tokens.length && p[k] === tokens[k]) k++;
    best = Math.max(best, k);
  }
  return best;
}

/** `settled`: the end of an operation, when the running list and the counts agree. */
function checkInvariants(s: PrefixState, capacity: number, settled: boolean) {
  expect(cachedTokens(s)).toBeLessThanOrEqual(capacity);
  for (const n of Object.values(s.nodes)) {
    if (n.uid !== ROOT) expect(n.tokens.length).toBeGreaterThan(0);
    // Children start with different tokens, so the walk down is never ambiguous.
    const firsts = n.kids.map((k) => s.nodes[k]!.tokens[0]);
    expect(new Set(firsts).size).toBe(firsts.length);
    for (const k of n.kids) expect(s.nodes[k]!.parent).toBe(n.uid);
    // A node's reference count is the number of running requests whose path holds it.
    if (settled && n.uid !== ROOT) {
      const users = s.running.filter((r) => pathUp(s, r.node).includes(n.uid)).length;
      expect(n.ref).toBe(users);
    }
  }
  // Each running request's path spells its prompt.
  if (settled) for (const r of s.running) expect(spell(s, r.node)).toEqual(r.tokens);
}

const wordArb = fc.constantFrom('the', 'a', 'cat', 'dog', 'sat', 'ran', 'on', 'mat', 'it');
const promptArb = fc.array(wordArb, { minLength: 1, maxLength: 6 }).map((w) => w.join(' '));
const callArb: fc.Arbitrary<OpCall> = fc.oneof(
  promptArb.map((p): OpCall => ['request', p]),
  promptArb.map((p): OpCall => ['request', p]),
  fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F').map((x): OpCall => ['finish', x]),
);
const settingsArb = fc.record({
  capacity: fc.constantFrom('12' as const, '16' as const, '24' as const),
});

describe('prefix-cache', () => {
  it('matches a reference, keeps its invariants and evicts least recently used first', () => {
    fc.assert(
      fc.property(settingsArb, fc.array(callArb, { maxLength: 20 }), (settings, calls) => {
        const cap = Number(settings.capacity);
        const t = new Timeline(prefixCache, settings as PrefixSettings, 1, calls);
        let before = t.initial.state;
        let prompts = 0;
        for (const e of t.entries) {
          for (const step of e.steps) {
            checkInvariants(step.state, cap, false);
            if (!step.lines.includes('r-evict')) continue;
            // The leaf evicted is the oldest unused one, and every other is no older.
            const id = step.marks.find((m) => m.id.startsWith('lru-'))!.id;
            const uid = Number(id.slice(4));
            const order = evictOrder(step.state);
            expect(order[0]).toBe(uid);
            const gone = step.state.nodes[uid]!;
            expect(gone.ref).toBe(0);
            expect(gone.kids).toEqual([]);
            for (const u of order)
              expect(step.state.nodes[u]!.last).toBeGreaterThanOrEqual(gone.last);
          }
          const end = e.end;
          checkInvariants(end, cap, true);
          if (e.call[0] === 'request' && end !== before) {
            const r = end.running.at(-1)!;
            const tokens = parsePrompt(e.call[1]) as string[];
            expect(r.matched).toBe(referenceMatch(before, tokens));
            expect(r.matched).toBe(matchLength(before, tokens));
            expect(r.reused + r.prefilled).toBe(tokens.length);
            expect(r.prefilled).toBeGreaterThanOrEqual(1);
            // Nothing is evicted when there was room.
            const need = tokens.length - r.matched;
            if (cap - cachedTokens(before) >= need) expect(end.evicted).toBe(before.evicted);
            prompts += tokens.length;
          }
          if (e.call[0] === 'request' && end === before && typeof e.call[1] === 'string') {
            const tokens = parsePrompt(e.call[1]);
            // A refused request either did not parse, had no slot, or did not fit.
            if (!(tokens instanceof Error) && before.running.length < MAX_RUNNING) {
              const need = tokens.length - matchLength(before, tokens);
              const locked = Object.values(before.nodes).reduce(
                (n, x) => n + (x.ref > 0 ? x.tokens.length : 0),
                0,
              );
              // There was no free slot for it, and even evicting all that is unused would
              // not have been enough.
              expect(need).toBeGreaterThan(cap - cachedTokens(before));
              expect(need).toBeGreaterThan(cap - locked - tokens.length + need);
            }
          }
          before = end;
        }
        const end = t.endState();
        expect(end.reused + end.prefilled).toBe(prompts);
      }),
      { numRuns: 300 },
    );
  });

  it('tells the story the examples tell', () => {
    const run = (id: string) => {
      const ex = prefixCache.examples.find((x) => x.id === id)!;
      return new Timeline(prefixCache, ex.settings as PrefixSettings, 1, ex.ops).endState();
    };
    const shared = run('shared-start');
    expect(treeLine(shared)).toBe(
      'the_cat:0:6(sat_on_the:0:4(mat:0:2 rug:0:4) ran_under_the_tree:0:6)',
    );
    expect([shared.reused, shared.prefilled]).toEqual([7, 11]);
    const chat = run('chat-turns');
    expect([chat.reused, chat.prefilled]).toEqual([9, 8]);
    const lru = run('lru-evicts');
    expect(treeLine(lru)).toBe(
      'the_cat_sat_on_the:1:5(rug:1:5) a_dog:1:6(ate_the_ball:0:4 ran:1:6)',
    );
    expect(lru.evicted).toBe(1);
    const held = run('running-protected');
    expect(treeLine(held)).toBe('the:2:4(dog_saw_the_ball:1:1 fox_ran_under_it:1:4)');
    expect(held.evicted).toBe(6);
    const waits = run('waits');
    expect(waits.running.map((r) => r.name)).toEqual(['A', 'C']);
    expect(waits.evicted).toBe(5);
    const whole = run('whole-prompt');
    expect([whole.reused, whole.prefilled]).toEqual([6, 7]);
    expect(run('nothing-shared').reused).toBe(0);
    const system = run('shared-system-prompt');
    expect([system.reused, system.prefilled]).toEqual([21, 11]);
    expect(treeLine(system)).toBe('a_cat_sat_on_a_mat_and:4:4(slept:1:1 ran:1:2 ate:1:3 saw:1:4)');
  });

  it('reads prompts and refuses what does not fit', () => {
    expect(parsePrompt('The cat, sat!')).toEqual(['the', 'cat', 'sat']);
    expect(parsePrompt('')).toBeInstanceOf(Error);
    expect(parsePrompt('a b c d e f g h i')).toBeInstanceOf(Error);
    expect(parsePrompt('the elephant')).toBeInstanceOf(Error);
    expect(parsePrompt('cat 42')).toBeInstanceOf(Error);
    const t = new Timeline(prefixCache, { capacity: '12' }, 1, [
      ['request', 'the cat sat on the mat'],
      ['request', 'a dog ate the ball'],
      ['request', 'the fox ran'],
      ['finish', 'Z'],
    ]);
    expect(t.entries[2]!.steps[0]!.say).toContain('C waits');
    expect(t.entries[3]!.steps[0]!.say).toContain('no running request Z');
  });

  it('stays readable on a laptop and a phone', () => {
    expect(smallestText(prefixCache, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(prefixCache, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
