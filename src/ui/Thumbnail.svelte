<script lang="ts">
  import { shapesBounds, type Scene } from '../render/scene';
  import Shapes from './Shapes.svelte';

  /** A static drawing of one scene, for practice questions and similar. */
  let { scene, height = 220 }: { scene: Scene; height?: number } = $props();
  // Crop to what is drawn: views reserve room for animation that a still picture does not need.
  const b = $derived(shapesBounds(scene.shapes) ?? scene.bounds);
  // Aim for 0.8 to 1.25 pixels per unit where the screen allows: a tall drawing (a deep tree)
  // gets more height so its text stays readable, and a small one is not blown up.
  const maxHeight = $derived(Math.max(height, Math.round(b.h * 0.8)));
  const maxWidth = $derived(Math.round(b.w * 1.25));
</script>

<svg
  viewBox="{b.x} {b.y} {b.w} {b.h}"
  style:max-width="{maxWidth}px"
  style:max-height="min({maxHeight}px, 70vh)"
  style:aspect-ratio="{b.w} / {b.h}"
  role="img"
  aria-label={scene.label}
>
  <Shapes shapes={scene.shapes} />
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
    margin: 0 auto;
  }
</style>
