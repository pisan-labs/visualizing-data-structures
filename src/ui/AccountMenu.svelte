<script lang="ts">
  import { tick } from 'svelte';
  import {
    account,
    confirmSwitch,
    connect,
    continueWithGoogle,
    declineSwitch,
    sendSignInLink,
    signOut,
  } from '../account/account.svelte';
  import { asAccountError } from '../account/backend';
  import { deleteMyData, sync } from '../account/sync.svelte';
  import { loadTurnstile, type Turnstile } from '../account/turnstile';
  import { notify, prefs } from './state.svelte';

  /**
   * "Sign in" in the site header, and the account menu once signed in. App.svelte shows it only
   * when accounts are on and the page is not an embed.
   */

  let dialog: HTMLDialogElement | undefined = $state();
  let signInButton: HTMLButtonElement | undefined = $state();
  let email = $state('');
  let busy = $state<'' | 'email' | 'google'>('');
  let sentTo = $state('');
  let problem = $state('');

  // The service may ask to wait before it sends another link to an address (1, 3, 5, 8, 13 and
  // 21 minutes, growing). "Email me a sign-in link" stays off until then.
  let waitUntil = $state(0);
  let now = $state(Date.now());
  const waiting = $derived(waitUntil > now);
  $effect(() => {
    const ms = waitUntil - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => (now = Date.now()), ms + 50);
    return () => clearTimeout(t);
  });
  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // A Turnstile check, shown only when the service asks for one.
  let challenge = $state<{ failed: boolean } | null>(null);
  let widgetBox: HTMLDivElement | undefined = $state();
  let turnstile: Turnstile | null = null;
  let widgetId: string | undefined;
  /** The address the check is for: once it passes, the same request goes again. */
  let challenged = '';

  function endChallenge() {
    if (turnstile && widgetId) turnstile.remove(widgetId);
    widgetId = undefined;
    challenge = null;
  }

  async function showChallenge(siteKey: string, failed: boolean, to: string) {
    challenged = to;
    challenge = { failed };
    if (widgetId) return;
    await tick();
    try {
      turnstile = await loadTurnstile();
    } catch (err) {
      problem = asAccountError(err).message;
      challenge = null;
      return;
    }
    if (!widgetBox || widgetId) return;
    widgetId = turnstile.render(widgetBox, {
      sitekey: siteKey,
      action: 'sign-in',
      theme: prefs.theme === 'dark' ? 'dark' : prefs.theme === 'auto' ? 'auto' : 'light',
      size: widgetBox.clientWidth < 300 ? 'compact' : 'normal',
      callback: (token) => void request(challenged, token),
      'error-callback': () => {
        problem = 'The check could not run. Try again, or use Google.';
      },
    });
  }

  async function request(to: string, token?: string) {
    busy = 'email';
    problem = '';
    sentTo = '';
    try {
      const answer = await sendSignInLink(to, token);
      if (answer.status === 'sent') {
        sentTo = to;
        endChallenge();
      } else if (answer.status === 'wait') {
        now = Date.now();
        waitUntil = Date.parse(answer.retryAt);
        endChallenge();
      } else {
        await showChallenge(answer.siteKey, answer.failed, to);
      }
    } catch (err) {
      // The address stays in the field, ready for another try.
      problem = asAccountError(err).message;
    } finally {
      busy = '';
      // A check's token works once: the next request needs a new one.
      if (token && turnstile && widgetId) turnstile.reset(widgetId);
    }
  }

  function open() {
    problem = '';
    sentTo = '';
    endChallenge();
    dialog?.showModal();
    // Load the account library now, so the buttons answer at once.
    connect().catch((e: unknown) => (problem = asAccountError(e).message));
  }

  function close() {
    dialog?.close();
  }

  function emailLink(e: SubmitEvent) {
    e.preventDefault();
    const to = email.trim();
    if (!to || waiting || busy) return;
    void request(to);
  }

  async function google() {
    busy = 'google';
    problem = '';
    try {
      // On success the page leaves for Google's sign-in.
      await continueWithGoogle();
    } catch (err) {
      problem = asAccountError(err).message;
      busy = '';
    }
  }

  // The account menu, signed in.
  let menu: HTMLDetailsElement | undefined = $state();
  let notifyBusy = $state(false);

  async function setNotify(e: Event & { currentTarget: HTMLInputElement }) {
    const box = e.currentTarget;
    notifyBusy = true;
    try {
      await sync.setNotifyNewPages(box.checked);
    } catch (err) {
      notify(asAccountError(err).message, 'error');
      box.checked = sync.notifyNewPages;
    } finally {
      notifyBusy = false;
    }
  }

  const syncNote = $derived(
    sync.status === 'syncing'
      ? 'Saving your settings and progress in your account…'
      : sync.status === 'offline'
        ? `${sync.problem} Your settings and progress are kept in this browser meanwhile.`
        : sync.status === 'unavailable'
          ? 'Your settings and progress are kept in this browser.'
          : 'Your settings and progress are kept in your account too.',
  );

  // "Delete my StepWise data", with a question first.
  let deleteDialog: HTMLDialogElement | undefined = $state();
  let keepButton: HTMLButtonElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();
  let deleting = $state(false);
  let deleted = $state(false);
  let deleteProblem = $state('');

  async function askDelete() {
    deleted = false;
    deleteProblem = '';
    if (menu) menu.open = false;
    deleteDialog?.showModal();
    await tick();
    keepButton?.focus();
  }

  async function confirmDelete() {
    deleting = true;
    deleteProblem = '';
    try {
      await deleteMyData();
      deleted = true;
      await tick();
      closeButton?.focus();
    } catch (err) {
      deleteProblem = asAccountError(err).message;
    } finally {
      deleting = false;
    }
  }

  async function deleteClosed() {
    if (!deleted) return;
    // The menu that opened it is gone (signed out): put focus on Sign in.
    await tick();
    signInButton?.focus();
  }

  // An emailed link for another account came back while someone is signed in here.
  let switchDialog: HTMLDialogElement | undefined = $state();
  $effect(() => {
    if (account.switchTo && !switchDialog?.open) switchDialog?.showModal();
    else if (!account.switchTo && switchDialog?.open) switchDialog.close();
  });
</script>

{#if account.user}
  <details class="account-menu" bind:this={menu}>
    <summary class="btn small">Account</summary>
    <div class="menu card">
      <p>Signed in as <strong class="email">{account.user.email ?? 'you'}</strong></p>
      <p class="muted small">{syncNote}</p>
      <div class="notify">
        <label>
          <input
            type="checkbox"
            checked={sync.notifyNewPages}
            disabled={notifyBusy || sync.status === 'unavailable'}
            onchange={setNotify}
            aria-describedby="notify-note"
          />
          Email me when new pages arrive
        </label>
        <p id="notify-note" class="muted small">You can turn this off here at any time.</p>
      </div>
      <div class="actions">
        <button class="btn small" onclick={() => signOut()}>Sign out</button>
        <button class="btn small danger" onclick={askDelete}>Delete my StepWise data</button>
      </div>
    </div>
  </details>
{:else}
  <button class="btn small" bind:this={signInButton} onclick={open} disabled={account.checking}>
    {account.checking ? 'Signing in…' : 'Sign in'}
  </button>
  <dialog
    bind:this={dialog}
    class="signin card"
    aria-labelledby="signin-title"
    onclick={(e) => {
      // A click on the backdrop (outside the box) closes it.
      if (e.target === dialog) close();
    }}
  >
    <div class="box">
      <div class="head">
        <h2 id="signin-title">Sign in</h2>
        <button class="btn small" onclick={close}>Close</button>
      </div>
      <p>Keep your examples, settings and progress in an account and use them on any computer.</p>

      <button class="btn wide" onclick={google} disabled={busy !== ''}>
        {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
      </button>

      <div class="or" aria-hidden="true"><span>or</span></div>

      <form onsubmit={emailLink}>
        <label for="signin-email">Email</label>
        <div class="row">
          <input
            id="signin-email"
            class="field grow"
            type="email"
            autocomplete="email"
            required
            bind:value={email}
          />
          <button class="btn" type="submit" disabled={busy !== '' || waiting}>
            {busy === 'email' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </div>
        {#if challenge}
          <div class="check">
            <p>
              {challenge.failed
                ? 'That check did not work; try again.'
                : 'One more step before we send the link: the check below.'}
            </p>
            <div class="widget" bind:this={widgetBox}></div>
          </div>
        {/if}
        <p class="status" class:problem={!!problem} role="status">
          {#if problem}
            {problem}
          {:else if sentTo}
            <strong>Check your email.</strong> We sent a sign-in link to {sentTo}.
          {:else if waiting}
            {`You can ask for another link at ${clock(waitUntil)}.`}
          {/if}
        </p>
      </form>

      <p class="privacy small muted">
        Your account keeps your email address, a display name, the examples you save, your settings
        (theme, speed, detail, code view and tab), your progress, the last release you saw, and
        whether you want email about new pages. With Google, it also keeps what Google sends: your
        name, picture link and Google account id. One account works on every HintWise app and is
        stored in the US. Nothing on this site tracks you.{challenge
          ? ' This check is run by Cloudflare.'
          : ''}
      </p>
    </div>
  </dialog>
{/if}

<dialog
  bind:this={deleteDialog}
  class="ask card"
  aria-labelledby="delete-title"
  onclose={deleteClosed}
>
  <div class="box">
    <h2 id="delete-title">Delete my StepWise data</h2>
    {#if deleted}
      <p role="status"><strong>Your StepWise data is deleted, and you are signed out.</strong></p>
      <p>
        Your account itself is shared with other HintWise apps, so it stays. To delete it too, email
        <a href="mailto:builder@hintwise.org">builder@hintwise.org</a>.
      </p>
      <div class="actions">
        <button class="btn" bind:this={closeButton} onclick={() => deleteDialog?.close()}
          >Close</button
        >
      </div>
    {:else}
      <p>This deletes, for good, the rows StepWise keeps in your account:</p>
      <ul>
        <li>your saved examples;</li>
        <li>
          your preferences: settings, progress, the last release you saw and the email choice;
        </li>
        <li>your lesson lists.</li>
      </ul>
      <p>
        It also clears this browser's copy of your settings and progress, and signs you out here.
        Examples saved in this browser only are kept. Sign out on your other computers first, or
        they save their copy again.
      </p>
      <p>
        Your account itself is shared with other HintWise apps and is not deleted here. Deleting it
        (email <a href="mailto:builder@hintwise.org">builder@hintwise.org</a>) also removes these
        rows.
      </p>
      {#if deleteProblem}<p class="problem" role="status">{deleteProblem}</p>{/if}
      <div class="actions">
        <button class="btn danger" onclick={confirmDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete my data'}
        </button>
        <button class="btn" bind:this={keepButton} onclick={() => deleteDialog?.close()}
          >Keep my data</button
        >
      </div>
    {/if}
  </div>
</dialog>

<dialog
  bind:this={switchDialog}
  class="ask card"
  aria-labelledby="switch-title"
  oncancel={() => declineSwitch()}
>
  {#if account.switchTo}
    <div class="box">
      <h2 id="switch-title">Switch accounts?</h2>
      <p>
        This sign-in link is for <strong class="email"
          >{account.switchTo.hint || 'another address'}</strong
        >. You are signed in as
        <strong class="email">{account.user?.email ?? 'someone else'}</strong>.
      </p>
      <div class="actions">
        <button class="btn" onclick={() => void confirmSwitch()}>Switch accounts</button>
        <button class="btn" onclick={() => declineSwitch()}>Stay signed in</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .account-menu {
    position: relative;
  }

  summary {
    list-style: none;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    display: grid;
    gap: 10px;
    width: min(320px, calc(100vw - 32px));
    padding: 12px 14px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
  }

  .menu p {
    margin: 0;
    font-size: 0.92rem;
  }

  .menu .small {
    font-size: 0.85rem;
  }

  .notify label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
  }

  .notify input {
    flex: none;
    width: 18px;
    height: 18px;
    margin: 1px 0 0;
  }

  .notify p {
    margin: 2px 0 0 26px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .actions .btn {
    white-space: normal;
  }

  .danger {
    border-color: var(--c-error);
    color: var(--c-error);
  }

  .email {
    overflow-wrap: anywhere;
  }

  .signin,
  .ask {
    width: min(460px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    color: var(--text);
  }

  .signin::backdrop,
  .ask::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  .box {
    display: grid;
    gap: 8px;
    padding: 16px 18px 18px;
  }

  .ask .box {
    gap: 10px;
  }

  .ask ul {
    margin: 0;
    padding-left: 1.3em;
    font-size: 0.95rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  p {
    margin: 0;
    font-size: 0.95rem;
  }

  .small {
    font-size: 0.86rem;
  }

  .wide {
    width: 100%;
    margin-top: 6px;
    white-space: normal;
  }

  .or {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 6px 0 2px;
    color: var(--text-2);
    font-size: 0.86rem;
  }

  .or::before,
  .or::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--line);
  }

  form {
    display: grid;
    gap: 6px;
  }

  label {
    font-weight: 600;
    font-size: 0.92rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .row .btn {
    white-space: normal;
  }

  .grow {
    flex: 1 1 200px;
    min-width: 0;
  }

  .check {
    display: grid;
    gap: 6px;
  }

  .widget {
    min-height: 65px;
    max-width: 100%;
    overflow: hidden;
  }

  .status {
    overflow-wrap: anywhere;
  }

  .problem {
    color: var(--c-error);
    font-weight: 600;
  }

  .privacy {
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
</style>
