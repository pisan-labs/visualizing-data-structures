<script lang="ts">
  import type { Session } from './session.svelte';

  let { session }: { session: Session } = $props();
  const specs = $derived(session.def.settings);
</script>

{#if specs.length}
  <details class="options card">
    <summary>Options</summary>
    <div class="body">
      {#each specs as s (s.key)}
        {#if s.kind === 'choice'}
          <fieldset>
            <legend>{s.label}</legend>
            {#each s.options as o (o.value)}
              <label class="choice">
                <input
                  type="radio"
                  name="setting-{s.key}"
                  value={o.value}
                  checked={session.settings[s.key] === o.value}
                  onchange={() => session.setSettings({ [s.key]: o.value })}
                />
                {o.label}
              </label>
            {/each}
            {#if s.help}<p class="help muted">{s.help}</p>{/if}
          </fieldset>
        {:else if s.kind === 'number'}
          <label class="number">
            <span>{s.label}</span>
            <input
              class="field"
              type="number"
              min={s.min}
              max={s.max}
              value={session.settings[s.key]}
              onchange={(e) => {
                const raw = Math.round(Number(e.currentTarget.value));
                const v = Number.isFinite(raw)
                  ? Math.max(s.min, Math.min(s.max, raw))
                  : Number(session.settings[s.key]);
                e.currentTarget.value = String(v);
                session.setSettings({ [s.key]: v });
              }}
            />
            <span class="muted">({s.min} to {s.max})</span>
          </label>
        {:else}
          <label class="choice">
            <input
              type="checkbox"
              checked={session.settings[s.key] === true}
              onchange={(e) => session.setSettings({ [s.key]: e.currentTarget.checked })}
            />
            {s.label}
          </label>
        {/if}
      {/each}
      <p class="note muted">Changing an option replays your history with the new setting.</p>
    </div>
  </details>
{/if}

<style>
  .options {
    padding: 0;
  }

  summary {
    padding: 10px 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .body {
    display: grid;
    gap: 12px;
    padding: 0 14px 12px;
  }

  fieldset {
    border: 1px solid var(--line);
    border-radius: 8px;
    margin: 0;
    padding: 8px 12px 10px;
  }

  legend {
    font-weight: 600;
    padding: 0 4px;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
  }

  .number {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .number input {
    width: 5.5em;
  }

  .help,
  .note {
    margin: 4px 0 0;
    font-size: 0.88rem;
  }
</style>
