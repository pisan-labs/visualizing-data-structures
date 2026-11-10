import type { SavedExample } from '../engine/types';
import { connect } from './account.svelte';
import { asAccountError, LIMITS, type AccountBackend, type AccountExample } from './backend';
import { saveToAccount } from './library';

/**
 * One page's examples in the reader's account, as the examples panel shows them. Changes
 * throw AccountError (the panel shows its message); the list stays as it was when one fails.
 */
export class AccountShelf {
  items = $state<AccountExample[]>([]);
  status = $state<'loading' | 'ready' | 'error'>('loading');
  /** Why the list could not be loaded, when status is 'error'. */
  problem = $state('');

  constructor(
    readonly viz: string,
    private readonly backend: () => Promise<AccountBackend> = connect,
  ) {}

  async refresh(): Promise<void> {
    this.status = 'loading';
    try {
      this.items = await (await this.backend()).listExamples(this.viz);
      this.status = 'ready';
    } catch (e) {
      this.problem = asAccountError(e).message;
      this.status = 'error';
    }
  }

  async save(title: string, example: SavedExample): Promise<AccountExample> {
    const row = await call(async () => saveToAccount(await this.backend(), title, example));
    this.items = [row, ...this.items.filter((i) => i.id !== row.id)];
    return row;
  }

  async rename(id: string, title: string): Promise<AccountExample> {
    const name = title.trim().slice(0, LIMITS.title);
    return this.change(id, { title: name });
  }

  async setShared(id: string, shared: boolean): Promise<AccountExample> {
    return this.change(id, { shared });
  }

  async remove(id: string): Promise<void> {
    await call(async () => (await this.backend()).deleteExample(id));
    this.items = this.items.filter((i) => i.id !== id);
  }

  private async change(
    id: string,
    patch: { title?: string; shared?: boolean },
  ): Promise<AccountExample> {
    try {
      const row = await (await this.backend()).updateExample(id, patch);
      this.items = this.items.map((i) => (i.id === id ? row : i));
      return row;
    } catch (e) {
      const problem = asAccountError(e);
      // Deleted elsewhere (another tab, another computer): take it off the list too.
      if (problem.kind === 'missing') this.items = this.items.filter((i) => i.id !== id);
      throw problem;
    }
  }
}

async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw asAccountError(e);
  }
}
