/**
 * How large a page's text is drawn, for tests that keep a page readable on the typical stages.
 * The stage scales a scene to fit (src/ui/Stage.svelte), so a text of font size f is drawn at
 * f × min(stage.w / bounds.w, stage.h / bounds.h) CSS pixels.
 *
 *   smallestText(def, stage)  the smallest text drawn in any step of any curated example
 */
import { validateExample } from '../engine/example';
import { Timeline } from '../engine/timeline';
import type { AnyVizDef, StageSize } from '../engine/types';

export interface SmallText {
  /** Drawn size in CSS pixels. */
  px: number;
  example: string;
  step: number;
  shape: string;
}

export function smallestText(def: AnyVizDef, stage: StageSize): SmallText {
  let worst: SmallText = { px: Infinity, example: '', step: 0, shape: '' };
  for (const raw of def.examples) {
    const ex = validateExample(def, raw);
    const t = new Timeline(def, ex.settings, ex.seed, ex.ops);
    for (let i = 0; i < t.length; i++) {
      const scene = def.view(t.at(i).step, t.settings, stage);
      const scale = Math.min(stage.w / scene.bounds.w, stage.h / scene.bounds.h);
      for (const s of scene.shapes) {
        if (s.kind !== 'text' || !String(s.text).trim()) continue;
        const px = (s.size ?? 16) * scale;
        if (px < worst.px) worst = { px, example: ex.id ?? '', step: i, shape: s.id };
      }
    }
  }
  return worst;
}
