import { describe, expect, it } from 'vitest';
import { practiceSet } from '../engine/practice';
import { vizzes } from '../viz/all';
import { lessonSlug, splitLessons } from './lessons';
import { assignmentLink, choiceLetter, keyAnswer, practiceScene } from './worksheet';

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

describe('worksheets', () => {
  it('print the same questions as the assignment link, whatever the count', () => {
    for (const def of vizzes.filter((d) => d.practice?.length)) {
      const ten = practiceSet(def, 12345, 10);
      const five = practiceSet(def, 12345, 5);
      expect(
        ten.slice(0, 5).map((q) => q.question.prompt),
        def.id,
      ).toEqual(five.map((q) => q.question.prompt));
    }
  });

  it('draw every question with shapes and write its answer for the key', () => {
    for (const def of vizzes.filter((d) => d.practice?.length).slice(0, 40)) {
      for (const { question } of practiceSet(def, 777, 5)) {
        expect(practiceScene(def, question).shapes.length, def.id).toBeGreaterThan(0);
        expect(keyAnswer(question.answer), def.id).not.toBe('');
      }
    }
  });

  it('letters the choices and links the set', () => {
    expect(choiceLetter(0)).toBe('A');
    expect(keyAnswer({ kind: 'choice', options: ['1', '2', '3'], correct: 2 })).toBe('C. 3');
    expect(keyAnswer({ kind: 'sequence', value: [] })).toBe('(nothing)');
    expect(assignmentLink('https://x.org', 'bst', 42, 10)).toBe(
      'https://x.org/bst/#practice=42&n=10',
    );
  });
});
