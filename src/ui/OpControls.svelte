<script lang="ts">
  import { makeRng, randomSeed } from '../engine/rng';
  import type { ControlButton, OpCall, Value } from '../engine/types';
  import type { OpTarget } from './pair.svelte';

  // One page's session, or a compare page's pair of sessions.
  let { session }: { session: OpTarget } = $props();

  const controls = $derived(session.def.controls);
  const primary = $derived(controls.buttons.find((b) => b.primary));
  const main = $derived(controls.buttons.filter((b) => !b.more));
  const more = $derived(controls.buttons.filter((b) => b.more));
  let text = $state('');
  let error = $state('');
  let input: HTMLInputElement | undefined = $state();

  const MAX_BULK = 50;

  const sizes = $derived(controls.sizes ?? [5, 8, 12]);
  let presetIndex = $state(0);
  let presetSize = $state<number | null>(null);
  const size = $derived(presetSize ?? sizes[Math.floor(sizes.length / 2)] ?? 5);

  function fill() {
    const p = controls.presets?.[presetIndex];
    if (!p) return;
    error = '';
    session.fill(p.make(makeRng(randomSeed()), size, session.settings));
  }

  function run(b: ControlButton) {
    if (!b.usesInput || !controls.input) {
      error = '';
      session.run([[b.op]]);
      return;
    }
    const several = (b.args?.length ?? 1) > 1;
    const tokens = b.bulk || several ? text.split(/[\s,]+/).filter(Boolean) : [text.trim()];
    if (several && tokens.length !== b.args!.length) {
      error = `${b.label} needs ${b.args!.join(' and ')}, separated by a space.`;
      input?.focus();
      return;
    }
    if (tokens.length === 0 || !tokens[0]) {
      error = 'Type a value first.';
      input?.focus();
      return;
    }
    if (tokens.length > MAX_BULK) {
      error = `At most ${MAX_BULK} values at a time.`;
      return;
    }
    const values: Value[] = [];
    for (const t of tokens) {
      const v = controls.input.parse(t);
      if (v instanceof Error) {
        error = tokens.length > 1 ? `"${t}": ${v.message}` : v.message;
        input?.focus();
        return;
      }
      values.push(v);
    }
    error = '';
    text = '';
    // Several values make one call, insert(2, 99); otherwise one call per value.
    session.run(several ? [[b.op, ...values]] : values.map((v): OpCall => [b.op, v]));
  }

  function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (primary) run(primary);
  }
</script>

<form class="controls card" onsubmit={onSubmit} aria-label="Operations">
  {#if controls.input}
    <label for="op-input">{controls.input.label}</label>
    <input
      id="op-input"
      bind:this={input}
      class="field"
      class:wide={controls.input.maxLength > 40}
      bind:value={text}
      placeholder={controls.input.placeholder}
      maxlength={controls.input.maxLength}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="go"
      data-sample={controls.input.sample ?? '5'}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? 'op-error' : undefined}
    />
  {/if}
  <div class="buttons">
    {#each main as b (b.op)}
      {#if b.primary}
        <button type="submit" class="btn primary" data-args={b.args?.length}>{b.label}</button>
      {:else}
        <button type="button" class="btn" data-args={b.args?.length} onclick={() => run(b)}
          >{b.label}</button
        >
      {/if}
    {/each}
    {#if controls.random}
      {@const random = controls.random}
      <button
        type="button"
        class="btn"
        onclick={() => session.run(random.make(makeRng(randomSeed())))}
      >
        {random.label}
      </button>
    {/if}
  </div>
  {#if more.length || controls.presets?.length}
    <div class="secondary">
      {#if more.length}
        <details class="more">
          <summary>More operations</summary>
          <div class="buttons">
            {#each more as b (b.op)}
              <button type="button" class="btn" data-args={b.args?.length} onclick={() => run(b)}
                >{b.label}</button
              >
            {/each}
          </div>
        </details>
      {/if}
      {#if controls.presets?.length}
        <div class="presets" role="group" aria-label="Start over with a preset">
          <label for="preset">Start over with</label>
          <select id="preset" class="field" bind:value={presetIndex}>
            {#each controls.presets as p, i (p.label)}
              <option value={i}>{p.label}</option>
            {/each}
          </select>
          {#if sizes.length}
            <label for="preset-size" class="visually-hidden">How many</label>
            <select
              id="preset-size"
              class="field"
              value={size}
              onchange={(e) => (presetSize = Number(e.currentTarget.value))}
            >
              {#each sizes as n (n)}
                <option value={n}>{n}</option>
              {/each}
            </select>
          {/if}
          <button type="button" class="btn" onclick={fill}>Fill</button>
        </div>
      {/if}
    </div>
  {/if}
  {#if error}
    <p id="op-error" class="error" role="alert">{error}</p>
  {/if}
</form>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 10px 12px;
  }

  label {
    font-weight: 600;
  }

  input {
    flex: 1 1 140px;
    min-width: 0;
    max-width: 260px;
  }

  /* Long inputs (a graph's edges, a text to search) get room to be read. */
  input.wide {
    flex-basis: 320px;
    max-width: 640px;
  }

  input[aria-invalid='true'] {
    border-color: var(--c-error);
    box-shadow: inset 0 0 0 1px var(--c-error);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .secondary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    flex-basis: 100%;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }

  /* Opened, the extra operations take a full line under the rest of the row. */
  .more[open] {
    flex-basis: 100%;
    order: 2;
  }

  .more summary {
    cursor: pointer;
    color: var(--text-2);
    font-size: 0.92rem;
    padding: 4px 0;
  }

  .more .buttons {
    padding-top: 6px;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 0.92rem;
    color: var(--text-2);
  }

  .presets select {
    min-height: 36px;
    color: var(--text);
  }

  /* A long preset label must not widen the row past the screen on phones. */
  #preset {
    min-width: 0;
    max-width: 100%;
    text-overflow: ellipsis;
  }

  .error {
    flex-basis: 100%;
    margin: 0;
    color: var(--c-error);
    font-weight: 600;
  }

  @media (max-width: 520px) {
    input {
      max-width: none;
    }
  }
</style>
