<script lang="ts">
  /**
   * Present mode's pointer: a large dot that follows the mouse, finger or stylus anywhere on the
   * page, for a projector. A mouse or stylus shows it while hovering; a finger, while touching.
   * It never takes a click.
   */
  let at = $state<{ x: number; y: number } | null>(null);

  function move(e: PointerEvent) {
    at = { x: e.clientX, y: e.clientY };
  }

  function up(e: PointerEvent) {
    if (e.pointerType === 'touch') at = null;
  }

  function leave(e: PointerEvent) {
    if (!e.relatedTarget) at = null;
  }
</script>

<svelte:window
  onpointermove={move}
  onpointerdown={move}
  onpointerup={up}
  onpointercancel={() => (at = null)}
/>
<svelte:document onpointerout={leave} />

{#if at}
  <div class="dot" style:transform="translate({at.x}px, {at.y}px)" aria-hidden="true"></div>
{/if}

<style>
  .dot {
    position: fixed;
    left: -15px;
    top: -15px;
    z-index: 60;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #ff2d2d;
    /* A white ring and a dark edge, so it reads on light, dark and busy backgrounds. */
    box-shadow:
      0 0 0 3px #ffffff,
      0 0 0 4.5px rgb(0 0 0 / 70%),
      0 0 18px 6px rgb(255 45 45 / 45%);
    pointer-events: none;
    forced-color-adjust: none;
  }
</style>
