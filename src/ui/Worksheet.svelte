<script lang="ts">
  import { marked } from 'marked';
  import { practiceSet } from '../engine/practice';
  import type { AnyVizDef } from '../engine/types';
  import { shapesBounds } from '../render/scene';
  import { SITE_NAME } from '../site';
  import Shapes from './Shapes.svelte';
  import { assignmentLink, choiceLetter, keyAnswer, practiceScene } from './worksheet';
  import './worksheet.css';

  /**
   * A practice set on paper: each question's picture and prompt with room to answer, and the
   * answer key on a page of its own. It is the same set an assignment link with this seed and
   * count gives. It is drawn only to be printed (worksheet.css): the page moves it to the end
   * of <body>, and while it prints nothing else does.
   */
  let {
    def,
    seed,
    count,
    key = true,
  }: { def: AnyVizDef; seed: number; count: number; key?: boolean } = $props();

  const items = $derived(practiceSet(def, seed, count));
  const link = $derived(assignmentLink(location.origin, def.id, seed, count));
  const inline = (s: string) => marked.parseInline(s, { async: false }) as string;

  /** Move the sheet to the end of <body>, so print CSS can show it alone. */
  function toBody(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<div class="ws-root" use:toBody>
  <article class="worksheet">
    <header class="ws-head">
      <p class="ws-site">{SITE_NAME} · Practice worksheet</p>
      <h1>{def.title}</h1>
      <p class="ws-meta">
        Set {seed}, {count} questions. The same questions online:
        <span class="ws-link">{link}</span>
      </p>
      <p class="ws-name">
        <span>Name</span><span class="ws-fill"></span><span>Date</span><span class="ws-fill short"
        ></span>
      </p>
      <p class="ws-how">
        Each picture shows the structure before the operations its question asks about.
      </p>
    </header>

    <ol class="ws-questions">
      {#each items as it, i (i)}
        {@const q = it.question}
        {@const scene = practiceScene(def, q)}
        {@const b = shapesBounds(scene.shapes) ?? scene.bounds}
        <li class="ws-q">
          <h2><span class="ws-n">{i + 1}.</span> {it.kind.title}</h2>
          <!-- Inline Markdown written by our own generators. -->
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <p class="ws-prompt">{@html inline(q.prompt)}</p>
          <svg
            class="ws-pic"
            viewBox="{b.x} {b.y} {b.w} {b.h}"
            style:max-width="{Math.round(b.w)}px"
            style:aspect-ratio="{b.w} / {b.h}"
            role="img"
            aria-label={scene.label}
          >
            <Shapes shapes={scene.shapes} />
          </svg>
          {#if q.answer.kind === 'choice'}
            <ul class="ws-choices">
              {#each q.answer.options as option, k (k)}
                <li>
                  <span class="ws-box" aria-hidden="true"></span>
                  <b>{choiceLetter(k)}.</b>
                  {option}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="ws-answer" class:long={q.answer.kind === 'sequence'}>
              <span>{q.answer.kind === 'number' ? 'Answer' : 'Answer, in order'}</span><span
                class="ws-fill"
              ></span>
            </p>
          {/if}
        </li>
      {/each}
    </ol>

    {#if key}
      <section class="ws-key">
        <h1>Answer key</h1>
        <p class="ws-meta">{def.title}, set {seed}, {count} questions.</p>
        <ol>
          {#each items as it, i (i)}
            <li>
              <span class="ws-n">{i + 1}.</span>
              <b>{keyAnswer(it.question.answer)}</b>
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              <span class="ws-why">{@html inline(it.question.explain)}</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  </article>
</div>
