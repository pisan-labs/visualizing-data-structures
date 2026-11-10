<script lang="ts">
  import { onMount } from 'svelte';
  import { account } from '../account/account.svelte';
  import { asAccountError } from '../account/backend';
  import { SITE_NAME } from '../site';
  import { navigate } from '../ui/route';
  import { itemHref, openPlayList } from './player.svelte';

  /**
   * The home page's lesson-list addresses (App.svelte): "My lesson lists" (/#lists), which loads
   * its editor only for a signed-in reader, and a list's link (/#list=<id>), which opens the
   * list's first example on its page.
   */
  let { route }: { route: { kind: 'lists' } | { kind: 'list'; id: string } } = $props();

  let problem = $state('');
  /** A list that opened but holds no examples: its name. */
  let empty = $state<string | null>(null);

  onMount(() => {
    document.title = `${route.kind === 'lists' ? 'My lesson lists' : 'Lesson list'} · ${SITE_NAME}`;
    if (route.kind === 'list') void start(route.id);
  });

  async function start(id: string) {
    try {
      // The link always asks the server, so it plays the list as it is now.
      const list = await openPlayList(id, true);
      if (!list.items.length) {
        empty = list.title || 'Untitled list';
        return;
      }
      navigate(itemHref(id, list, 1), true);
    } catch (e) {
      problem = asAccountError(e).message;
    }
  }

  const editor = () => import('./LessonLists.svelte');
</script>

<div class="lists-route">
  {#if route.kind === 'list'}
    {#if problem}
      <h1>Lesson list</h1>
      <p role="alert">{problem}</p>
      <p><a href="/">See all visualizations</a></p>
    {:else if empty !== null}
      <h1>{empty}</h1>
      <p>This lesson list has no examples yet.</p>
      <p><a href="/">See all visualizations</a></p>
    {:else}
      <p class="muted" role="status">Opening the lesson list…</p>
    {/if}
  {:else if !account.enabled}
    <h1>My lesson lists</h1>
    <p>Lesson lists are kept in an account, and accounts are not available on this site.</p>
    <p><a href="/">See all visualizations</a></p>
  {:else if account.user}
    {#await editor()}
      <p class="muted" role="status">Loading your lesson lists…</p>
    {:then { default: LessonLists }}
      <LessonLists userId={account.user.id} />
    {:catch}
      <h1>My lesson lists</h1>
      <p role="alert">Could not load your lesson lists. Reload the page to try again.</p>
    {/await}
  {:else if account.checking}
    <h1>My lesson lists</h1>
    <p class="muted" role="status">Checking your sign-in…</p>
  {:else}
    <h1>My lesson lists</h1>
    <p>
      A lesson list puts examples saved in your account, from any pages, in the order you teach
      them, with a link to play them in class. Sign in (at the top of the page) to make one.
    </p>
  {/if}
</div>

<style>
  .lists-route {
    max-width: 960px;
    margin: 0 auto;
    padding: 20px 16px 32px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: clamp(1.5rem, 4vw, 2rem);
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  p {
    max-width: 66ch;
    margin: 0 0 8px;
  }
</style>
