import fs from 'node:fs';
import { it } from 'vitest';
import { validateExample } from '../../engine/example';
import { Timeline } from '../../engine/timeline';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { dpTree } from '../dp-tree';
import { dpBitmask as def } from '.';

it('prints numbers', () => {
  const out: string[] = [];
  for (const raw of def.examples) {
    const ex = validateExample(def, raw);
    for (const approach of ['pattern', 'naive']) {
      const t = new Timeline(def, { approach }, 1, ex.ops);
      const e = t.entries.at(-1)!;
      const last = e.steps.at(-1)!;
      const seen = last.extra?.seen;
      out.push(
        `${ex.id} ${approach}: best ${e.end.best} tasks ${e.end.tasks?.join(' ')} steps ${e.steps.length} vars ${JSON.stringify(last.vars)} seen ${seen?.join(',') ?? ''}`,
      );
      out.push(`   say: ${last.say}`);
    }
  }
  for (const d of [def, dpTree]) {
    const a = smallestText(d, LAPTOP_STAGE);
    const b = smallestText(d, PHONE_STAGE);
    out.push(
      `${d.id} laptop ${a.px.toFixed(2)} ${a.example} ${a.shape}; phone ${b.px.toFixed(2)} ${b.example} ${b.shape}`,
    );
  }
  fs.writeFileSync(
    '/tmp/claude-0/-home-user-visualizing-data-structures/1519983e-b547-5d17-a070-cca0a9733a2f/scratchpad/_dp3/mask-numbers.txt',
    out.join('\n') + '\n',
  );
});
