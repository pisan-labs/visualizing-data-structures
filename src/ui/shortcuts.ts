/**
 * Every keyboard shortcut, in one table. The pages' key handlers look keys up here and the
 * shortcuts list ("?") is drawn from it, so the list cannot drift from what the keys do.
 */

export type ShortcutId =
  | 'play'
  | 'forward'
  | 'back'
  | 'slower'
  | 'faster'
  | 'help'
  | 'tabs'
  | 'pointer'
  | 'pen'
  | 'undo-ink'
  | 'clear-ink'
  | 'escape'
  | 'list-previous'
  | 'list-next';

/**
 * Where a shortcut exists: on every page, on a page with the tab row, in Present mode, or while
 * a lesson list plays.
 */
export type ShortcutNeeds = 'tabs' | 'present' | 'list';

export interface Shortcut {
  id: ShortcutId;
  /** The `KeyboardEvent.key` values that do it. */
  keys: readonly string[];
  /** The same keys as the list shows them. */
  show: readonly string[];
  /** What it does, as the list says it. */
  does: string;
  group: 'Playback' | 'Page' | 'Present mode' | 'Lesson list';
  needs?: ShortcutNeeds;
  /** Works while typing in a field and with Ctrl, Alt or Cmd held (Escape). */
  anywhere?: boolean;
  /** Not on a focused button, link or summary, which Space clicks. */
  notOnControls?: boolean;
  /** Only on a focused tab of the tab row, with or without modifier keys. */
  onTab?: boolean;
  /** Keeps the browser from using the key too (scrolling the page). */
  prevent?: boolean;
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'play',
    keys: [' '],
    show: ['Space'],
    does: 'Play or pause',
    group: 'Playback',
    notOnControls: true,
    prevent: true,
  },
  {
    id: 'forward',
    keys: ['ArrowRight', 'PageDown'],
    show: ['→', 'Page Down'],
    does: 'Step forward',
    group: 'Playback',
    prevent: true,
  },
  {
    id: 'back',
    keys: ['ArrowLeft', 'PageUp'],
    show: ['←', 'Page Up'],
    does: 'Step back',
    group: 'Playback',
    prevent: true,
  },
  { id: 'slower', keys: ['-'], show: ['-'], does: 'Slower', group: 'Playback' },
  { id: 'faster', keys: ['+', '='], show: ['+', '='], does: 'Faster', group: 'Playback' },
  { id: 'help', keys: ['?'], show: ['?'], does: 'Show this list of shortcuts', group: 'Page' },
  {
    id: 'tabs',
    keys: ['ArrowLeft', 'ArrowRight'],
    show: ['←', '→'],
    does: 'Move to the tab before or after, when a tab (Learn, Big-O, …) has focus',
    group: 'Page',
    needs: 'tabs',
    onTab: true,
    prevent: true,
  },
  {
    id: 'pointer',
    keys: ['l', 'L'],
    show: ['L'],
    does: 'Pointer on or off: a large dot that follows the mouse or finger',
    group: 'Present mode',
    needs: 'present',
  },
  {
    id: 'pen',
    keys: ['p', 'P'],
    show: ['P'],
    does: 'Pen on or off: draw over the picture',
    group: 'Present mode',
    needs: 'present',
  },
  {
    id: 'undo-ink',
    keys: ['u', 'U'],
    show: ['U'],
    does: 'Undo the last stroke',
    group: 'Present mode',
    needs: 'present',
  },
  {
    id: 'clear-ink',
    keys: ['c', 'C'],
    show: ['C'],
    does: 'Clear all ink',
    group: 'Present mode',
    needs: 'present',
  },
  {
    id: 'escape',
    keys: ['Escape'],
    show: ['Esc'],
    does: 'Turn the pointer or pen off; with both off, leave Present mode',
    group: 'Present mode',
    needs: 'present',
    anywhere: true,
  },
  // Not Page Up and Page Down, which presentation clickers send to step through the example.
  {
    id: 'list-previous',
    keys: ['<'],
    show: ['<'],
    does: 'Previous example in the lesson list',
    group: 'Lesson list',
    needs: 'list',
  },
  {
    id: 'list-next',
    keys: ['>'],
    show: ['>'],
    does: 'Next example in the lesson list',
    group: 'Lesson list',
    needs: 'list',
  },
];

/**
 * What has the focus when a key is pressed; some shortcuts leave some places alone. A dialog
 * (the shortcuts list) handles its own keys, so no shortcut works inside one.
 */
export type KeyPlace = 'dialog' | 'field' | 'tab' | 'control' | 'other';

export function keyPlace(target: EventTarget | null): KeyPlace {
  const el = target instanceof Element ? target : null;
  if (!el) return 'other';
  if (el.closest('dialog')) return 'dialog';
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return 'field';
  if (el.closest('[role="tab"]')) return 'tab';
  if (el.closest('button, a, summary')) return 'control';
  return 'other';
}

export interface KeyPress {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * The shortcut a key press does, or null. `active` says which shortcuts the page has right now
 * (Present mode's only while presenting).
 */
export function matchShortcut(
  e: KeyPress,
  place: KeyPlace,
  active: (s: Shortcut) => boolean,
): Shortcut | null {
  if (place === 'dialog') return null;
  const modified = e.altKey || e.ctrlKey || e.metaKey;
  for (const s of SHORTCUTS) {
    if (!s.keys.includes(e.key) || !active(s)) continue;
    if (s.onTab) {
      if (place === 'tab') return s;
      continue;
    }
    if (s.anywhere) return s;
    if (modified || place === 'field' || place === 'tab') continue;
    if (s.notOnControls && place === 'control') continue;
    return s;
  }
  return null;
}

/** The pages a shortcut list is for: which of the needs they meet. */
export type PageHas = Partial<Record<ShortcutNeeds, boolean>>;

/** The shortcuts a page has, in table order: the ones its list shows. */
export function shortcutsFor(has: PageHas): Shortcut[] {
  return SHORTCUTS.filter((s) => !s.needs || has[s.needs]);
}

export type KeyActions = Partial<Record<ShortcutId, (e: KeyboardEvent) => void>>;

/**
 * Runs the shortcut for a key press, if the page has one: the one key handler every page uses.
 * Returns whether a shortcut ran.
 */
export function runShortcut(
  e: KeyboardEvent,
  actions: KeyActions,
  active: (s: Shortcut) => boolean = () => true,
): boolean {
  const s = matchShortcut(e, keyPlace(e.target), (x) => !!actions[x.id] && active(x));
  if (!s) return false;
  if (s.prevent) e.preventDefault();
  actions[s.id]!(e);
  return true;
}

/** The playback speeds, slowest first. */
export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const;

/** The speed one notch slower (-1) or faster (+1), staying within the list. */
export function nextSpeed(speed: number, dir: -1 | 1): number {
  const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))]!;
}
