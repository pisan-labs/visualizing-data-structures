/**
 * Cloudflare Turnstile, the check the sign-in-link service may ask for before it emails a link.
 * It is the only script StepWise loads from another site, and only once the service has asked
 * for a check: never up front, never on any other page or for any other reason.
 */
import { AccountError } from './backend';

export const TURNSTILE_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileOptions {
  sitekey: string;
  action: string;
  theme: 'auto' | 'light' | 'dark';
  size: 'normal' | 'compact';
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
}

export interface Turnstile {
  render(el: HTMLElement, options: TurnstileOptions): string | undefined;
  reset(id?: string): void;
  remove(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

/** Load Turnstile's script once. Throws AccountError when it cannot be loaded. */
export function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    const fail = () => {
      loading = null;
      script.remove();
      reject(
        new AccountError('unreachable', 'The check could not load. Try again, or use Google.'),
      );
    };
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail());
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}
