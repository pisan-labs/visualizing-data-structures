import { describe, expect, it } from 'vitest';
import { vizzes } from '../viz/all';
import { lessonSlug, splitLessons } from './lessons';

describe('splitting a concept page into lessons', () => {
  it('starts a lesson at each ## heading, outside fenced blocks', () => {
    const md = [
      'Intro text.',
      '',
      '## The `push` *idea*',
      'Body.',
      '```python',
      '## not a heading',
      '```',
      '### A subsection stays inside',
      '## [Try this](#play:x)',
      'Go.',
    ].join('\n');
    const lessons = splitLessons(md);
    expect(lessons.map((l) => [l.slug, l.title])).toEqual([
      [null, ''],
      ['the-push-idea', 'The push idea'],
      ['try-this-play-x', 'Try this'],
    ]);
    expect(lessons[1]!.body).toContain('## not a heading');
    expect(lessons[1]!.body).toContain('### A subsection');
    expect(lessons.map((l) => l.body).join('\n')).toBe(md);
  });

  it('has no introduction when the page starts with a lesson', () => {
    expect(splitLessons('## One\nA.\n## Two\nB.').map((l) => l.slug)).toEqual(['one', 'two']);
  });

  it('gives the slugs the deep links use', () => {
    expect(lessonSlug('When to use it (and when not)')).toBe('when-to-use-it-and-when-not');
  });

  it('finds lessons on every page, with distinct slugs', () => {
    for (const def of vizzes) {
      const slugs = splitLessons(def.explain).flatMap((l) => (l.slug ? [l.slug] : []));
      expect(slugs.length, def.id).toBeGreaterThan(0);
      expect(new Set(slugs).size, def.id).toBe(slugs.length);
    }
  });
});
