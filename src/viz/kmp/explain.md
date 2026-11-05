# Knuth-Morris-Pratt

Brute force forgets. In GABABABACABABACG it matches ABABA at shift 1, fails on the next character, slides P one place and compares T[2..5] all over again. It has just seen those characters. Knuth, Morris and Pratt (the paper is from 1977) asked what a partial match already tells you. Quite a lot: if ABABA matched, the text there is ABABA, so where P could start next depends on P alone. Work that out once, before the search, and the search never has to look back.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `computePrefix(P)` | Builds the table π[0..m − 1] from P alone | O(m) |
| `kmpSearch(T, P)` | Returns every shift where P occurs in T | O(n), plus the table |

π[j] is the length of the longest proper prefix of P[0..j] that is also a suffix of it, its longest border. For P = ABABAC, π = 0 0 1 2 3 0. π[4] = 3 because ABA starts and ends ABABA.

The search keeps a shift s and a count q: at shift s, the first q characters of P are known to match. Compare T[s + q] with P[q] and keep going while they agree. When a mismatch comes after q matches, the text under P[0..q − 1] is exactly P[0..q − 1]. P can only start again where one of its prefixes lines up with a suffix of that, and the longest such prefix is π[q − 1] characters long. So slide P by q − π[q − 1], and count those π[q − 1] characters as matched: q = π[q − 1]. With nothing matched (q = 0), slide one place. [Show me](#play:keeps-three)

In the drawing, a dashed green cell is known to match without being compared. The table sits above the text, and the value a slide reads lights up.

## The text pointer never moves back

The next character of the text to compare is i = s + q. A match moves i forward. A slide adds q − π[q − 1] to s and takes the same amount off q, so i stays where it is: the character that failed is compared again, with an earlier character of P. Only with q = 0 does a mismatch move i on.

That gives the bound. Every successful comparison moves i forward, so there are at most n of them, and every alignment ends with at most one failed comparison. Brute force's worst case, [AAA…AB and AAAB](#example:worst-case), costs it 52 comparisons. KMP makes 28, under its limit of 2n − m + 1 = 29. [Show me](#play:worst-case)

It also means KMP reads the text once, left to right. It can read a stream or a huge file one character at a time without keeping the old characters around.

```check
Q: P = ABABAC, so π = 0 0 1 2 3 0. At some shift, ABABA matched and then the text did not have a C. How far does KMP slide P?
- 1 place
* 2 places
- 3 places
- 5 places
= q = 5 characters matched and π[4] = 3, so P slides 5 − 3 = 2 places and its first 3 characters, ABA, are already in place.
```

## Building the table

Building π is KMP run on P against itself. For each i from 1 to m − 1, q is the longest border found so far. If P[q] = P[i], the border grows: q = q + 1. If not, fall back to the next shorter border, q = π[q − 1], and try again, down to q = 0. The drawing puts P under the table and slides a copy of P under it, so π[j] ends up right above P[j]. [Building π for AABAACAABAA](#example:build-table) falls back twice at the C before it climbs to π[10] = 5. [Show me](#play:build-table)

Why is this O(m) when there is a loop inside a loop? q goes up by at most one for each i, and every fallback takes it down by at least one. It cannot fall more than it has climbed, so the fallbacks add fewer than m comparisons in all.

```check
Q: What is π for P = AABAAB?
* 0 1 0 1 2 3
- 0 1 0 0 1 2
- 0 0 0 1 2 3
- 0 1 0 1 2 0
= At j = 1, AA has the border A. AAB has none. Then the borders A, AA and AAB grow back one character at a time, because AABAAB repeats AAB.
```

## Prefix function or failure function?

CLRS calls the table the prefix function, π. Many other books call it the failure function, because it says where to go when a comparison fails. The numbers are the same; the **Call the table** option switches the name. Books also index it differently: CLRS counts from 1, so its π[q] is about P[1..q], which is our π[q − 1]. Check which version a piece of code uses before you borrow it.

## When to use it

Use it when you need a guarantee: O(n + m) whatever the text looks like. It shines on repetitive input, DNA or binary data, where brute force bogs down, and on streams, since it never backs up. On ordinary English text, [Boyer-Moore](/boyer-moore/) is usually faster because it skips characters instead of reading every one. If you will search for the same pattern many times, build the table once and keep it. The table depends on P alone: load a new text with the same pattern here, and the table stays.

## Common mistakes

- Reading π[q] instead of π[q − 1] after a mismatch at P[q]. With 0-based indexing, the border of what matched is π[q − 1].
- Sliding P all the way past a match. ABABA occurs in ABABABABAB at 0, 2 and 4. After a match, slide by m − π[m − 1], not m. [Overlapping matches](#example:overlapping)
- Mixing up the 1-based table from CLRS with 0-based strings.
- Forgetting the q = 0 case and computing π[−1].

## Try this

- [A slide that keeps three characters](#example:keeps-three). At each mismatch, predict the slide from the table before you step.
- [A match at every shift](#example:every-shift): eight matches for ten comparisons.
- [No match, but every slide keeps AB](#example:no-match).
- Press Compare and pick Brute-force string search, then load AAAAAAAAAAAAAAAAAAAB / AAAAB. Count both.
- Load a pattern of your own and press **Build the table** (under More operations). Predict each value before it appears.
