import { describe, expect, it } from 'vitest';
import { aboutSize } from './format';

describe('download size', () => {
  it('reads as megabytes with one decimal, or whole kilobytes', () => {
    expect(aboutSize(2_853_000)).toBe('about 2.9 MB');
    expect(aboutSize(1_000_000)).toBe('about 1.0 MB');
    expect(aboutSize(640_400)).toBe('about 640 KB');
    expect(aboutSize(120)).toBe('about 1 KB');
  });
});
