import { describe, expect, it } from 'vitest';
import {
  matchShortcut,
  nextSpeed,
  SHORTCUTS,
  shortcutsFor,
  type KeyPlace,
  type KeyPress,
  type Shortcut,
} from './shortcuts';

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});
const all = (_: Shortcut) => true;
const id = (key: string, place: KeyPlace = 'other', mods: Partial<KeyPress> = {}, active = all) =>
  matchShortcut(press(key, mods), place, active)?.id ?? null;

describe('the shortcuts table', () => {
  it('gives each key one meaning in each place', () => {
    for (const place of ['other', 'tab'] as const) {
      const seen = new Map<string, string>();
      for (const s of SHORTCUTS) {
        if (!!s.onTab !== (place === 'tab') && !s.anywhere) continue;
        for (const k of s.keys) {
          expect(seen.get(k), `${k} on ${place}`).toBeUndefined();
          seen.set(k, s.id);
        }
      }
    }
  });

  it('shows every key it listens for, and says what each does', () => {
    for (const s of SHORTCUTS) {
      expect(s.show.length, s.id).toBeGreaterThan(0);
      expect(s.does.length, s.id).toBeGreaterThan(5);
      // Letters count once, whatever the case.
      expect(new Set(s.keys.map((k) => k.toLowerCase())).size).toBe(s.show.length);
    }
  });

  it('lists the tabs, Present mode and a lesson list only on pages that have them', () => {
    const ids = (s: Shortcut[]) => s.map((x) => x.id);
    expect(ids(shortcutsFor({}))).toEqual(['play', 'forward', 'back', 'slower', 'faster', 'help']);
    expect(ids(shortcutsFor({ tabs: true, present: true, list: true }))).toEqual(
      SHORTCUTS.map((s) => s.id),
    );
    expect(ids(shortcutsFor({ tabs: true, present: true }))).not.toContain('list-next');
    expect(ids(shortcutsFor({ list: true })).slice(-2)).toEqual(['list-previous', 'list-next']);
  });
});

describe('matching a key press', () => {
  it('plays, steps and changes speed', () => {
    expect(id(' ')).toBe('play');
    expect(id('ArrowRight')).toBe('forward');
    expect(id('PageDown')).toBe('forward');
    expect(id('ArrowLeft')).toBe('back');
    expect(id('PageUp')).toBe('back');
    expect(id('-')).toBe('slower');
    expect(id('+')).toBe('faster');
    expect(id('=')).toBe('faster');
    expect(id('?', 'other', { ctrlKey: false })).toBe('help');
    expect(id('x')).toBeNull();
  });

  it('leaves typing, tabs and dialogs alone', () => {
    for (const k of [' ', 'ArrowRight', '-', '?', 'p']) {
      expect(id(k, 'field')).toBeNull();
      expect(id(k, 'dialog')).toBeNull();
    }
    expect(id(' ', 'tab')).toBeNull();
    expect(id('ArrowRight', 'tab')).toBe('tabs');
  });

  it('lets Space click a focused button, but arrows still step', () => {
    expect(id(' ', 'control')).toBeNull();
    expect(id('ArrowRight', 'control')).toBe('forward');
  });

  it('ignores Ctrl, Alt and Cmd, except for Escape and the tab row', () => {
    expect(id('ArrowRight', 'other', { ctrlKey: true })).toBeNull();
    expect(id('p', 'other', { metaKey: true })).toBeNull();
    expect(id('-', 'other', { altKey: true })).toBeNull();
    expect(id('Escape', 'other', { ctrlKey: true })).toBe('escape');
    expect(id('Escape', 'field')).toBe('escape');
    expect(id('ArrowLeft', 'tab', { ctrlKey: true })).toBe('tabs');
  });

  it('only matches what the page has right now', () => {
    const notPresenting = (s: Shortcut) => s.needs !== 'present';
    expect(id('p', 'other', {}, notPresenting)).toBeNull();
    expect(id('Escape', 'other', {}, notPresenting)).toBeNull();
    expect(id('p')).toBe('pen');
    expect(id('P')).toBe('pen');
    expect(id('l')).toBe('pointer');
    expect(id('u')).toBe('undo-ink');
    expect(id('c')).toBe('clear-ink');
  });

  it('moves through a lesson list only while one plays, and not while typing', () => {
    const noList = (s: Shortcut) => s.needs !== 'list';
    expect(id('>', 'other', {}, noList)).toBeNull();
    expect(id('<', 'other', {}, noList)).toBeNull();
    expect(id('>')).toBe('list-next');
    expect(id('<')).toBe('list-previous');
    expect(id('>', 'control')).toBe('list-next');
    expect(id('>', 'field')).toBeNull();
    expect(id('<', 'tab')).toBeNull();
    expect(id('>', 'other', { ctrlKey: true })).toBeNull();
  });
});

describe('speed keys', () => {
  it('move one notch and stop at the ends', () => {
    expect(nextSpeed(1, 1)).toBe(1.5);
    expect(nextSpeed(1, -1)).toBe(0.5);
    expect(nextSpeed(4, 1)).toBe(4);
    expect(nextSpeed(0.25, -1)).toBe(0.25);
    // A speed off the list starts from the slowest, as before.
    expect(nextSpeed(3, 1)).toBe(0.25);
  });
});
