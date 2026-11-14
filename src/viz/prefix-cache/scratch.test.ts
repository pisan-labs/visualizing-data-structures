import fs from 'node:fs';
import { it } from 'vitest';
import { validateExample } from '../../engine/example';
import { Timeline } from '../../engine/timeline';
import { prefixCache } from '.';
import { treeLine } from '.';

it('dumps', () => {
  const out: string[] = [];
  for (const raw of prefixCache.examples) {
    const ex = validateExample(prefixCache, raw);
    const t = new Timeline(prefixCache, ex.settings as never, ex.seed, ex.ops);
    out.push(`=== ${ex.id}`);
    for (const e of t.entries) {
      out.push(`-- ${JSON.stringify(e.call)}`);
      for (const s of e.steps) out.push(`  [${s.level}] ${s.say}`);
      out.push(`  tree: ${treeLine(e.end)}  vars: ${JSON.stringify(e.steps.at(-1)!.vars)}`);
    }
  }
  fs.writeFileSync(
    '/tmp/claude-0/-home-user-visualizing-data-structures/1519983e-b547-5d17-a070-cca0a9733a2f/scratchpad/_serve3/prefix.txt',
    out.join('\n'),
  );
});
