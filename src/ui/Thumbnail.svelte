<script lang="ts">
  import { shapesBounds, type Scene } from '../render/scene';
  import Shapes from './Shapes.svelte';

  /** A static drawing of one scene, for practice questions and similar. */
  let { scene, height = 220 }: { scene: Scene; height?: number } = $props();
  // Crop to what is drawn: views reserve room for animation that a still picture does not need.
  const b = $derived(shapesBounds(scene.shapes) ?? scene.bounds);
</script>

<svg
  viewBox="{b.x} {b.y} {b.w} {b.h}"
  style:max-height="{height}px"
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
