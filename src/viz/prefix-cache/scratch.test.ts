import fs from 'node:fs';
import { it } from 'vitest';
import { validateExample } from '../../engine/example';
import { Timeline } from '../../engine/timeline';
import type { AnyVizDef } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { flashAttention } from '../flash-attention';
import { prefixCache } from '.';

const dir =
  '/tmp/claude-0/-home-user-visualizing-data-structures/1519983e-b547-5d17-a070-cca0a9733a2f/scratchpad/_serve3';

function dump(def: AnyVizDef, file: string) {
  const out: string[] = [];
  out.push(
    `sizes ${JSON.stringify([smallestText(def, LAPTOP_STAGE), smallestText(def, PHONE_STAGE)])}`,
  );
  for (const raw of def.examples) {
    const ex = validateExample(def, raw);
    const t = new Timeline(def, ex.settings, ex.seed, ex.ops);
    out.push(`=== ${ex.id}`);
    for (const e of t.entries) {
      out.push(`-- ${JSON.stringify(e.call)}`);
      for (const s of e.steps) out.push(`  [${s.level}] ${s.say}`);
      out.push(`  vars: ${JSON.stringify(e.steps.at(-1)!.vars)}`);
    }
  }
  fs.writeFileSync(`${dir}/${file}`, out.join('\n'));
}

it('dumps', () => {
  dump(prefixCache, 'prefix.txt');
  dump(flashAttention, 'flash.txt');
});
