<script lang="ts">
  import { Marked, Renderer } from 'marked';
  import { onMount, tick } from 'svelte';
  import { validateExample } from '../engine/example';
  import {
    checkId,
    pageSummary,
    reachLesson,
    setCheckRight,
    setLesson,
    summaryText,
    withOutline,
    type Progress,
  } from '../progress/progress';
  import ConceptCheck, { type Check } from './ConceptCheck.svelte';
  import { lessonSlug as slug, onReach, splitLessons } from './lessons';
  import { now, progress } from './progress.svelte';
  import type { Session } from './session.svelte';
  import { notify } from './state.svelte';

  let { session, lesson = null }: { session: Session; lesson?: string | null } = $props();

  // Each "##" section is a lesson with its own deep link (/<viz>/#lesson=<slug>).
  const md = new Marked({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        return `<h${depth} id="lesson-${slug(text)}">${inner}</h${depth}>\n`;
      },
      // A table can be wider than a phone: its longest words and code, one per column, do not
      // break. It scrolls inside its own box, so the page never scrolls sideways. A box that
      // scrolls must be reachable by keyboard (WCAG 2.1.1): a region named by its columns.
      table(token) {
        const name = token.header
          .map((cell) => this.parser.parseInline(cell.tokens).replace(/<[^>]+>/g, ''))
          .join(', ');
        const table = Renderer.prototype.table.call(this, token);
        return `<div class="table-wrap" role="region" tabindex="0" aria-label="Table: ${name}">\n${table}</div>\n`;
      },
    },
  });

  type Segment = { kind: 'html'; html: string } | { kind: 'check'; check: Check };

  function parseCheck(body: string): Check {
    const check: Check = { question: '', options: [], explain: '' };
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (line.startsWith('Q:')) check.question = line.slice(2).trim();
      else if (line.startsWith('- ')) check.options.push({ text: line.slice(2), correct: false });
      else if (line.startsWith('* ')) check.options.push({ text: line.slice(2), correct: true });
      else if (line.startsWith('=')) check.explain = line.slice(1).trim();
    }
    return check;
  }

  function segmentsOf(source: string): Segment[] {
    const out: Segment[] = [];
    const re = /```check\n([\s\S]*?)```/g;
    let last = 0;
    for (const m of source.matchAll(re)) {
      out.push({
        kind: 'html',
        html: md.parse(source.slice(last, m.index), { async: false }) as string,
      });
      out.push({ kind: 'check', check: parseCheck(m[1]!) });
      last = m.index! + m[0].length;
    }
    out.push({ kind: 'html', html: md.parse(source.slice(last), { async: false }) as string });
    return out;
  }

  // The page already shows the title, so drop the Markdown's first heading. Each "##" section
  // is a lesson the reader can mark read.
  const lessons = $derived(
    splitLessons(session.def.explain.replace(/^# .*\n+/, '')).map((l) => ({
      ...l,
      segments: segmentsOf(l.body),
    })),
  );

  // Progress: the lessons read and the checks answered right (src/progress/progress.ts).
  const viz = $derived(session.def.id);
  const outline = $derived({
    lessons: lessons.flatMap((l) => (l.slug ? [l.slug] : [])),
    checks: lessons.flatMap((l) =>
      l.segments.flatMap((s) => (s.kind === 'check' ? [checkId(s.check.question)] : [])),
    ),
  });
  const marks = $derived(progress.current.pages[viz]);
  const summary = $derived(pageSummary(progress.current, viz, outline));

  /** Record a change, noting the page's lessons and checks so the catalog can count them. */
  function record(change: (p: Progress) => Progress) {
    progress.update((p) => change(withOutline(p, viz, outline, now())));
  }

  /** The reader reached a lesson's end: mark it read, unless they have marked it themselves. */
  function reachEnd(node: Element, slug: string) {
    return {
      destroy: onReach(node, () => {
        if (!progress.current.pages[viz]?.lessons[slug])
          record((p) => reachLesson(p, viz, slug, now()));
      }),
    };
  }

  let article: HTMLElement | undefined = $state();

  // [Title](#example:id) loads an example; [Show me](#play:id) loads it and plays it.
  $effect(() => {
    const el = article;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a');
      const href = a?.getAttribute('href') ?? '';
      const m = /^#(example|play):([\w-]+)$/.exec(href);
      if (!m) return;
      e.preventDefault();
      const ex = session.def.examples.find((x) => x.id === m[2]);
      if (!ex) return;
      session.load(validateExample(session.def, ex));
      document
        .getElementById('stage-anchor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (m[1] === 'play') session.play();
      else notify(`Loaded "${ex.title}". Press play or step through it.`);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  });

  onMount(async () => {
    // Once there is progress here, keep the catalog's count of this page's lessons up to date.
    if (progress.current.pages[viz]) record((p) => p);
    if (!lesson) return;
    await tick();
    document.getElementById(`lesson-${slug(lesson)}`)?.scrollIntoView({ block: 'start' });
  });
</script>

<div class="learn-tools">
  {#if summary.started}
    <p class="progress-note">Your progress here: {summaryText(summary)}.</p>
  {/if}
  <button class="btn small" onclick={() => print()} title="Print this explanation as a handout">
    Print
  </button>
</div>

<article class="learn" bind:this={article}>
  {#each lessons as l, li (li)}
    <div class="lesson">
      {#each l.segments as seg, si (si)}
        {#if seg.kind === 'html'}
          <!-- Our own Markdown, rendered at runtime. -->
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html seg.html}
        {:else}
          <ConceptCheck
            check={seg.check}
            n="{li}-{si}"
            onanswer={(right) => {
              if (right) record((p) => setCheckRight(p, viz, checkId(seg.check.question), now()));
            }}
          />
        {/if}
      {/each}
      {#if l.slug}
        {@const slug = l.slug}
        {@const read = !!marks?.lessons[slug]?.done}
        {@const label = read ? 'Read' : 'Mark as read'}
        <!-- The lesson's heading describes the box. Its title is not in the box's name, so the
             name never clashes with another control's label. -->
        <label class="lesson-end" class:read use:reachEnd={slug}>
          <input
            type="checkbox"
            checked={read}
            aria-describedby="lesson-{slug}"
            onchange={(e) => {
              const done = e.currentTarget.checked;
              record((p) => setLesson(p, viz, slug, done, now()));
            }}
          />
          <span>{label}</span>
        </label>
      {/if}
    </div>
  {/each}
</article>

<p class="license muted">Text licensed under CC BY 4.0.</p>

<style>
  .learn-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px 12px;
  }

  .progress-note {
    flex: 1 1 16em;
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-2);
  }

  /* The end of a lesson: reaching it marks the lesson read; the box changes that by hand. */
  .lesson-end {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-height: 32px;
    margin: 4px 0 0;
    font-size: 0.85rem;
    color: var(--text-2);
    cursor: pointer;
  }

  .lesson-end input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--c-new);
  }

  .lesson-end.read {
    color: var(--c-new);
    font-weight: 600;
  }

  @media print {
    .lesson-end {
      display: none;
    }
  }

  .learn {
    line-height: 1.6;
  }

  .learn :global(h2) {
    font-size: 1.05rem;
    margin: 1.2em 0 0.4em;
    scroll-margin-top: 12px;
  }

  .learn :global(p),
  .learn :global(li) {
    margin: 0.4em 0;
  }

  .learn :global(.table-wrap) {
    overflow-x: auto;
  }

  .learn :global(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.92rem;
  }

  .learn :global(th),
  .learn :global(td) {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }

  .learn :global(code) {
    background: var(--surface-2);
    padding: 1px 4px;
    border-radius: 4px;
  }

  /* Long code lines wrap, so phones never scroll sideways. */
  .learn :global(pre) {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .learn :global(ul) {
    padding-left: 1.2em;
  }

  .learn :global(a[href^='#play:']) {
    font-weight: 700;
  }

  .learn :global(a[href^='#play:'])::before {
    content: '▶ ';
  }

  .license {
    font-size: 0.8rem;
    margin-top: 16px;
  }
</style>
