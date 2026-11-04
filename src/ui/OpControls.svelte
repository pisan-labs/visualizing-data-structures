<script lang="ts">
  import { makeRng, randomSeed } from '../engine/rng';
  import type { ControlButton, OpCall } from '../engine/types';
  import type { Session } from './session.svelte';

  let { session }: { session: Session } = $props();

  const controls = $derived(session.def.controls);
  const primary = $derived(controls.buttons.find((b) => b.primary));
  let text = $state('');
  let error = $state('');
  let input: HTMLInputElement | undefined = $state();

  const MAX_BULK = 50;

  function run(b: ControlButton) {
    if (!b.usesInput || !controls.input) {
      error = '';
      session.run([[b.op]]);
      return;
    }
    const tokens = b.bulk ? text.split(/[\s,]+/).filter(Boolean) : [text.trim()];
    if (tokens.length === 0 || !tokens[0]) {
      error = 'Type a value first.';
      input?.focus();
      return;
    }
    if (tokens.length > MAX_BULK) {
      error = `At most ${MAX_BULK} values at a time.`;
      return;
    }
    const calls: OpCall[] = [];
    for (const t of tokens) {
      const v = controls.input.parse(t);
      if (v instanceof Error) {
        error = tokens.length > 1 ? `"${t}": ${v.message}` : v.message;
        input?.focus();
        return;
      }
      calls.push([b.op, v]);
    }
    error = '';
    text = '';
    session.run(calls);
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
      bind:value={text}
      placeholder={controls.input.placeholder}
      maxlength={controls.input.maxLength}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="go"
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? 'op-error' : undefined}
    />
  {/if}
  <div class="buttons">
    {#each controls.buttons as b (b.op)}
      {#if b.primary}
        <button type="submit" class="btn primary">{b.label}</button>
      {:else}
        <button type="button" class="btn" onclick={() => run(b)}>{b.label}</button>
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

  input[aria-invalid='true'] {
    border-color: var(--c-error);
    box-shadow: inset 0 0 0 1px var(--c-error);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
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
