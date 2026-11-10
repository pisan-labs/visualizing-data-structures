<script lang="ts">
  import {
    account,
    connect,
    continueWithGoogle,
    sendSignInLink,
    signOut,
  } from '../account/account.svelte';
  import { asAccountError, LINK_WAIT_MS, secondsLeft } from '../account/backend';

  /**
   * "Sign in" in the site header, and the account menu once signed in. App.svelte shows it only
   * when accounts are on and the page is not an embed.
   */

  let dialog: HTMLDialogElement | undefined = $state();
  let email = $state('');
  let busy = $state<'' | 'email' | 'google'>('');
  let sentTo = $state('');
  let problem = $state('');

  // After a link is sent (or the server asks us to wait), "Email me a sign-in link" waits.
  let waitUntil = $state(0);
  let now = $state(Date.now());
  const wait = $derived(secondsLeft(waitUntil, now));
  $effect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => (now = Date.now()), 1000);
    return () => clearTimeout(t);
  });
  function waitFor(ms: number) {
    now = Date.now();
    waitUntil = now + ms;
  }

  function open() {
    problem = '';
    sentTo = '';
    dialog?.showModal();
    // Load the account library now, so the buttons answer at once.
    connect().catch((e: unknown) => (problem = asAccountError(e).message));
  }

  function close() {
    dialog?.close();
  }

  async function emailLink(e: SubmitEvent) {
    e.preventDefault();
    const to = email.trim();
    if (!to || wait > 0) return;
    busy = 'email';
    problem = '';
    sentTo = '';
    try {
      await sendSignInLink(to);
      sentTo = to;
      waitFor(LINK_WAIT_MS);
    } catch (err) {
      // The address stays in the field, ready for another try.
      const why = asAccountError(err);
      problem = why.message;
      if (why.retryAfter) waitFor(why.retryAfter * 1000);
    } finally {
      busy = '';
    }
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
</script>

{#if account.user}
  <details class="account-menu">
    <summary class="btn small">Account</summary>
    <div class="menu card">
      <p>Signed in as <strong class="email">{account.user.email ?? 'you'}</strong></p>
      <button class="btn small" onclick={signOut}>Sign out</button>
    </div>
  </details>
{:else}
  <button class="btn small" onclick={open} disabled={account.checking}>
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
      <p>Keep your examples in an account and open them on any computer.</p>

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
            aria-describedby="email-note"
          />
          <button class="btn" type="submit" disabled={busy !== '' || wait > 0}>
            {busy === 'email' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </div>
        <p class="status" class:problem={!!problem} role="status">
          {#if problem}
            {problem}
          {:else if sentTo}
            <strong>Check your email.</strong> We sent a sign-in link to {sentTo}.
          {/if}
        </p>
        <p id="email-note" class="muted small">
          Open the link in this browser: it works only in the browser that asked for it.
        </p>
        {#if wait > 0}
          <p class="muted small">
            {`You can ask for another link in ${wait} ${wait === 1 ? 'second' : 'seconds'}.`}
          </p>
        {/if}
      </form>

      <p class="privacy small muted">
        Your account keeps your email address, a display name and the examples you save. With
        Google, it also keeps what Google sends: your name, picture link and Google account id. One
        account works on every HintWise app and is stored in the US. Nothing on this site tracks
        you.
      </p>
    </div>
  </dialog>
{/if}

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
    width: min(300px, calc(100vw - 32px));
    padding: 12px 14px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
  }

  .menu p {
    margin: 0 0 10px;
    font-size: 0.92rem;
  }

  .email {
    overflow-wrap: anywhere;
  }

  .signin {
    width: min(460px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    color: var(--text);
  }

  .signin::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  .box {
    display: grid;
    gap: 8px;
    padding: 16px 18px 18px;
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
