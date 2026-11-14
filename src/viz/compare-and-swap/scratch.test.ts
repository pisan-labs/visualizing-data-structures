import { it } from 'vitest';
import fs from 'node:fs';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { Timeline } from '../../engine/timeline';
import def from '.';

const OUT =
  '/tmp/claude-0/-home-user-visualizing-data-structures/1519983e-b547-5d17-a070-cca0a9733a2f/scratchpad/_threads3/cas.txt';

it('numbers', () => {
  const out: string[] = [];
  out.push(JSON.stringify(smallestText(def, LAPTOP_STAGE)));
  out.push(JSON.stringify(smallestText(def, PHONE_STAGE)));
  for (const ex of def.examples) {
    const t = new Timeline(def, { ...def.defaults, ...ex.settings }, 1, ex.ops);
    out.push(`--- ${ex.id}`);
    for (let i = 0; i < t.length; i++) {
      const st = t.at(i).step;
      if (st.level === 1 || ex.id === 'aba' || ex.id === 'retry-once') out.push(`${i}: ${st.say}`);
    }
    out.push(JSON.stringify(t.at(t.length - 1).step.vars));
  }
  fs.writeFileSync(OUT, out.join('\n'));
});
