# Boyer-Moore

Brute force and KMP read the text from left to right. Boyer and Moore (1977) compared from the other end. Put P under the text and look first at the text character under P's last position. Say it is a Z and P has no Z. Then P cannot match here, and it cannot match at the next m − 1 shifts either: each of them would put some character of P on that Z. So slide P all the way past it. On ordinary text that happens a lot, and Boyer-Moore never even looks at most of the characters.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `shiftTable(P)` | Builds a table with one entry per character | O(m + σ) |
| `search(T, P)` | Returns every shift where P occurs in T | about n / m on ordinary text, O(mn) at worst |

σ is the size of the alphabet. At each shift, compare P[m − 1] with T[s + m − 1], then P[m − 2] with T[s + m − 2], and so on, right to left, until two characters differ or all of P matches. Then slide P, by an amount that comes from a table built from P alone.

## Horspool's simplification

Horspool (1980) kept one table. shift[c] is how far the last c in P[0..m − 2] is from the end of P, or m if there is no c there. Whatever happened at a shift, look at the text character under P's last position, T[s + m − 1], and slide by shift[T[s + m − 1]]. That lines up the next copy of that character in P with it, or slides P past it. [Show me](#play:two-matches)

Why leave out P's last character? It is already under T[s + m − 1]. Counting it would give a shift of 0, and the search would stop moving.

In [big jumps](#example:skips), most letters of the text are not in HIDING, so P often slides all six places and finds HIDING with 10 comparisons for a text of 23 characters. [Show me](#play:skips)

```check
Q: P = HIDING. What is shift['I'] in Horspool's table?
* 2
- 1
- 4
- 6
= Only P[0..4] = HIDIN counts. The last I there is at index 3, so shift['I'] = m − 1 − 3 = 6 − 1 − 3 = 2.
```

## Both rules

Boyer and Moore's original has two rules, and slides by whichever allows more. Set **Shift rules** to try it.

- **Bad character**: c = T[s + j] is the character that failed. Slide so the last c in P lines up with it: j − last[c]. If c is not in P, last[c] = −1 and P slides past it. If the last c is right of position j, the rule says nothing useful.
- **Good suffix**: P[j + 1..m − 1] matched. Slide so another copy of it in P lines up with the text, one not preceded by P[j], since P[j] has just failed there. If there is no such copy, line up the longest prefix of P that matches the end of what matched. After a full match, line up the longest prefix that is also a suffix, as KMP would.

The label under each shift says which rule won: bc for bad character, gs for good suffix. No label means they agreed. [Both rules at work](#example:both-rules) uses each of them. [Show me](#play:both-rules)

The good suffix rescues Horspool's worst case. In [AAA…A and BAAA](#example:worst-case), the text character under the end of P is always A, so Horspool slides one place after four comparisons: 52 in all. With both rules, the good suffix sees that AAA occurs nowhere else in BAAA and that BAAA does not start with an A, so P slides four places: [16 comparisons](#example:good-suffix).

```check
Q: P = ABCAB is at shift s. P[4] = B matched, then P[3] = A did not: the text has a C there. last['C'] = 2. How far does the bad-character rule slide P?
* 1
- 2
- 3
- 5
= j − last['C'] = 3 − 2 = 1: that puts P[2] = C under the C in the text. The good-suffix rule may still allow more.
```

## How fast is it?

At best, each shift costs one comparison and slides m places, so the search makes about n / m comparisons. That is fewer comparisons than there are characters in the text. Longer patterns and bigger alphabets give longer slides. With four letters, as in DNA, slides are short, and the gain over brute force is small.

The worst case is still O(mn). Horspool hits it on [AAA…A and BAAA](#example:worst-case). The full rules avoid that one, but not [a match at every shift](#example:every-shift): after each match P slides one place and compares all of it again. Galil's rule (1979) remembers the part that already matched and brings the worst case down to O(n + m).

## When to use it

Use it to search for a word in a long text with a big alphabet: a document, a log file, source code. Tools such as GNU grep use variants of it. Horspool's version is short and is usually all you need. Avoid it for short patterns, where the table costs more than it saves, and for long repetitive inputs over a few letters, where [KMP](/kmp/)'s guarantee is worth more.

## Common mistakes

- Including P's last character in Horspool's table. If it occurs nowhere else, its entry becomes 0 and the search stops moving.
- Using the bad-character rule on its own without taking at least 1. j − last[c] can be zero or negative, and P stands still or slides backwards.
- Mixing up the two lookups. Horspool always uses T[s + m − 1]; the bad-character rule uses the character that failed, T[s + j].
- After a match, sliding by m. That skips overlapping matches.

## Try this

- [Two matches, four alignments](#example:two-matches). Before each slide, find the table entry it will use.
- [No match after two comparisons](#example:no-match).
- [The worst case for Horspool](#example:worst-case). Then switch **Shift rules** and run it again.
- [A match at every shift](#example:every-shift).
- Start over with many different letters and 24 characters. How many comparisons does the search make? Is it fewer than 24?
