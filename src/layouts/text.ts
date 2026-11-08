/**
 * Text measurement for layouts, in scene units. The drawing cannot measure text before it is
 * placed, so layouts estimate a width from the character count and the font size.
 *
 *   textWidth(text, size, mono?, bold?)  an upper bound on the drawn width
 *   wrapText(text, maxWidth, size, { mono, bold })  words wrapped into lines no wider than maxWidth
 *   sup(k)  a number in superscript digits: sup(-3) is "⁻³"
 *
 * The factors are measured, not guessed (Chromium, 8 November 2026, ten label-like strings
 * such as "q0 q1 q2 accept", "aⁿbⁿcⁿ", "Θ(n²) Ω(n) ∅ ε", "insert(42)"): glyphs average 0.50 of
 * the size in the site's font and at most 0.53; DejaVu Sans, the font CI and many Linux desktops
 * fall back to, averages 0.53 and reaches 0.58, and 0.63 in bold; monospace is 0.60. Each factor
 * below is the widest measured, so a label sized by it fits in every one of these fonts, and is
 * a little roomy in the narrower ones.
 */

const REGULAR = 0.58;
const BOLD = 0.64;
const MONO = 0.6;

/** Width of a one-line text at a font size: an upper bound across the fonts we render with. */
export function textWidth(text: string, size: number, mono = false, bold = false): number {
  return [...text].length * size * (mono ? MONO : bold ? BOLD : REGULAR);
}

export interface WrapOptions {
  mono?: boolean;
  bold?: boolean;
}

/**
 * Words wrapped into lines no wider than maxWidth, breaking only at spaces. A word wider than
 * the line gets a line of its own (it is never split).
 */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  { mono = false, bold = false }: WrapOptions = {},
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, mono, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A number (or a string of digits and minus signs) in superscript: sup(-3) is "⁻³". */
export const sup = (k: number | string): string =>
  String(k).replace(/[-0-9]/g, (ch) => (ch === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(ch)]!));
