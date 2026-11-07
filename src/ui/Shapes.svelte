<script module lang="ts">
  let count = 0;
  /** Marker ids must be unique when several drawings share a page. */
  const nextUid = () => (count += 1);
</script>

<script lang="ts">
  import { GROUP_ROLES } from '../engine/types';
  import type { Shape } from '../render/scene';

  /** Draws scene shapes inside an <svg>. Used by the stage and by static pictures. */
  let { shapes }: { shapes: Shape[] } = $props();

  const uid = nextUid();

  const roleClass = (role?: string) => (role ? `role-${role}` : '');
  // Arrow roles with their own colored head; any other role draws the base head.
  const HEAD_ROLES = [
    ...['active', 'error', 'found', 'new', 'done', 'compare', 'visit', 'remove'],
    ...GROUP_ROLES,
  ];
  const markerFor = (role?: string) =>
    `url(#arrow-${uid}-${role && HEAD_ROLES.includes(role) ? role : 'base'})`;
</script>

<defs>
  {#each ['base', ...HEAD_ROLES] as r (r)}
    <marker
      id="arrow-{uid}-{r}"
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path d="M0 0L10 5L0 10z" class="arrowhead role-{r}" />
    </marker>
  {/each}
</defs>
{#each shapes as s (s.id)}
  {#if s.kind === 'rect'}
    <rect
      class="shape rect {s.cls ?? ''} {roleClass(s.role)}"
      x={s.x}
      y={s.y}
      width={s.w}
      height={s.h}
      rx={s.r ?? 4}
      opacity={s.opacity ?? 1}
    />
  {:else if s.kind === 'text'}
    <text
      class="shape text {s.cls ?? ''} {roleClass(s.role)}"
      class:mono={s.mono}
      x={s.x}
      y={s.y}
      font-size={s.size ?? 16}
      font-weight={s.weight === 'bold' ? 700 : 400}
      text-anchor={s.anchor ?? 'start'}
      opacity={s.opacity ?? 1}>{s.text}</text
    >
  {:else if s.kind === 'arrow' && s.via}
    <path
      class="shape arrow curve {s.cls ?? ''} {roleClass(s.role)}"
      d="M{s.x1} {s.y1}Q{s.via.x} {s.via.y} {s.x2} {s.y2}"
      stroke-dasharray={s.dashed ? '5 4' : undefined}
      marker-end={s.head === 'none' ? undefined : markerFor(s.role)}
      marker-start={s.head === 'both' ? markerFor(s.role) : undefined}
      opacity={s.opacity ?? 1}
    />
  {:else if s.kind === 'arrow'}
    <line
      class="shape arrow {s.cls ?? ''} {roleClass(s.role)}"
      x1={s.x1}
      y1={s.y1}
      x2={s.x2}
      y2={s.y2}
      stroke-dasharray={s.dashed ? '5 4' : undefined}
      marker-end={s.head === 'none' ? undefined : markerFor(s.role)}
      marker-start={s.head === 'both' ? markerFor(s.role) : undefined}
      opacity={s.opacity ?? 1}
    />
  {:else if s.kind === 'polygon'}
    <polygon
      class="shape polygon {s.cls ?? ''} {roleClass(s.role)}"
      points={s.points.map((q) => `${q.x},${q.y}`).join(' ')}
      opacity={s.opacity ?? 1}
    />
  {:else if s.kind === 'circle'}
    <circle
      class="shape circle {s.cls ?? ''} {roleClass(s.role)}"
      cx={s.x}
      cy={s.y}
      r={s.r}
      opacity={s.opacity ?? 1}
    />
  {/if}
{/each}

<style>
  .shape {
    transition:
      fill var(--tween) ease,
      stroke var(--tween) ease;
  }

  .rect,
  .circle {
    fill: var(--cell-empty);
    stroke: var(--line-strong);
    stroke-width: 1.5;
  }

  .rect.live,
  .circle.live {
    fill: var(--cell-live);
    stroke: var(--text-2);
  }

  /* Automata: an accept state's inner ring, a dead state, and the left end of a tape. */
  .shape.circle.ring {
    fill: none;
  }

  .circle.dead-state {
    stroke-dasharray: 4 3;
  }

  .shape.rect.wall {
    fill: var(--text-2);
    stroke: none;
  }

  .rect.ghost,
  .circle.ghost {
    fill: none;
    stroke: var(--line-strong);
    stroke-dasharray: 5 4;
  }

  .text {
    fill: var(--text);
    font-family: var(--font);
  }

  .text.mono {
    font-family: var(--mono);
  }

  .text.index,
  .text.label {
    fill: var(--text-2);
  }

  .arrow {
    stroke: var(--text-2);
    stroke-width: 2;
  }

  .arrow.curve {
    fill: none;
  }

  .arrowhead {
    fill: var(--text-2);
  }

  /* Pointer dots (circles with the arrowhead class) take the arrow color, without a ring. */
  .circle.arrowhead {
    fill: var(--text-2);
    stroke: none;
  }

  /* Filled areas: a faint tint of the role's color, no outline (lines draw the edges). */
  .polygon {
    fill: var(--text-2);
    fill-opacity: 0.12;
    stroke: none;
  }
  .polygon.role-active {
    fill: var(--c-active);
  }
  .polygon.role-found {
    fill: var(--c-found);
  }
  .polygon.role-new,
  .polygon.role-done {
    fill: var(--c-new);
  }
  .polygon.role-error {
    fill: var(--c-error);
  }
  .polygon.role-compare {
    fill: var(--c-compare);
  }
  .polygon.role-visit {
    fill: var(--c-visit);
  }

  /* Roles */
  .rect.role-active,
  .circle.role-active {
    stroke: var(--c-active);
    stroke-width: 3;
    fill: color-mix(in srgb, var(--c-active) 14%, var(--cell-live));
  }
  .rect.role-new,
  .rect.role-done,
  .circle.role-new,
  .circle.role-done {
    stroke: var(--c-new);
    stroke-width: 3;
    fill: color-mix(in srgb, var(--c-new) 14%, var(--cell-live));
  }
  .rect.role-found,
  .circle.role-found {
    stroke: var(--c-found);
    stroke-width: 3;
    fill: color-mix(in srgb, var(--c-found) 14%, var(--cell-live));
  }
  .rect.role-error,
  .circle.role-error {
    stroke: var(--c-error);
    stroke-width: 3;
    fill: color-mix(in srgb, var(--c-error) 12%, var(--cell-live));
  }
  .rect.role-compare,
  .circle.role-compare {
    stroke: var(--c-compare);
    stroke-width: 3;
  }
  .rect.role-visit,
  .circle.role-visit {
    stroke: var(--c-visit);
    stroke-width: 3;
  }
  .rect.role-remove,
  .circle.role-remove {
    stroke: var(--c-remove);
    stroke-width: 3;
  }

  .text.role-active {
    fill: var(--c-active);
    font-weight: 700;
  }
  .text.role-new,
  .text.role-done {
    fill: var(--c-new);
  }
  .text.role-found {
    fill: var(--c-found);
  }
  .text.role-error {
    fill: var(--c-error);
    font-weight: 700;
  }
  .text.role-stale {
    fill: var(--c-stale);
    font-style: italic;
    font-weight: 400;
  }

  .arrow.role-active {
    stroke: var(--c-active);
    stroke-width: 3;
  }
  .arrow.role-error {
    stroke: var(--c-error);
    stroke-width: 3;
  }
  .arrowhead.role-active {
    fill: var(--c-active);
  }
  .arrowhead.role-error {
    fill: var(--c-error);
  }
  .arrowhead.role-found {
    fill: var(--c-found);
  }
  .arrowhead.role-new,
  .arrowhead.role-done {
    fill: var(--c-new);
  }
  .arrowhead.role-compare {
    fill: var(--c-compare);
  }
  .arrowhead.role-visit {
    fill: var(--c-visit);
  }
  .arrowhead.role-remove {
    fill: var(--c-remove);
  }
  /* Lines take their role's color too, so a tree or matching edge reads without its head. */
  .arrow.role-found {
    stroke: var(--c-found);
    stroke-width: 3;
  }
  .arrow.role-new {
    stroke: var(--c-new);
    stroke-width: 3;
  }
  .arrow.role-done {
    stroke: var(--c-new);
    stroke-width: 4;
  }
  .arrow.role-compare {
    stroke: var(--c-compare);
    stroke-width: 3;
  }
  .arrow.role-visit {
    stroke: var(--c-visit);
    stroke-width: 3;
  }
  .arrow.role-remove {
    stroke: var(--c-remove);
    stroke-width: 3;
  }
  /* Group colors tell groups apart; text keeps its own color for contrast. */
  .rect.role-g1,
  .circle.role-g1 {
    stroke: var(--c-g1);
    stroke-width: 3;
  }
  .arrow.role-g1 {
    stroke: var(--c-g1);
    stroke-width: 3;
  }
  .arrowhead.role-g1 {
    fill: var(--c-g1);
  }
  .rect.role-g2,
  .circle.role-g2 {
    stroke: var(--c-g2);
    stroke-width: 3;
  }
  .arrow.role-g2 {
    stroke: var(--c-g2);
    stroke-width: 3;
  }
  .arrowhead.role-g2 {
    fill: var(--c-g2);
  }
  .rect.role-g3,
  .circle.role-g3 {
    stroke: var(--c-g3);
    stroke-width: 3;
  }
  .arrow.role-g3 {
    stroke: var(--c-g3);
    stroke-width: 3;
  }
  .arrowhead.role-g3 {
    fill: var(--c-g3);
  }
  .rect.role-g4,
  .circle.role-g4 {
    stroke: var(--c-g4);
    stroke-width: 3;
  }
  .arrow.role-g4 {
    stroke: var(--c-g4);
    stroke-width: 3;
  }
  .arrowhead.role-g4 {
    fill: var(--c-g4);
  }
  .rect.role-g5,
  .circle.role-g5 {
    stroke: var(--c-g5);
    stroke-width: 3;
  }
  .arrow.role-g5 {
    stroke: var(--c-g5);
    stroke-width: 3;
  }
  .arrowhead.role-g5 {
    fill: var(--c-g5);
  }
  .rect.role-g6,
  .circle.role-g6 {
    stroke: var(--c-g6);
    stroke-width: 3;
  }
  .arrow.role-g6 {
    stroke: var(--c-g6);
    stroke-width: 3;
  }
  .arrowhead.role-g6 {
    fill: var(--c-g6);
  }
  .rect.role-g7,
  .circle.role-g7 {
    stroke: var(--c-g7);
    stroke-width: 3;
  }
  .arrow.role-g7 {
    stroke: var(--c-g7);
    stroke-width: 3;
  }
  .arrowhead.role-g7 {
    fill: var(--c-g7);
  }
  .rect.role-g8,
  .circle.role-g8 {
    stroke: var(--c-g8);
    stroke-width: 3;
  }
  .arrow.role-g8 {
    stroke: var(--c-g8);
    stroke-width: 3;
  }
  .arrowhead.role-g8 {
    fill: var(--c-g8);
  }
</style>
