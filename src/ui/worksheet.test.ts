import { describe, expect, it } from 'vitest';
import { practiceSet } from '../engine/practice';
import { vizzes } from '../viz/all';
import { assignmentLink, choiceLetter, keyAnswer, practiceScene } from './worksheet';

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
