# Z-algorithm

Pick a position in a string and ask how far the string, read from there, matches its own start. That number is Z[i]. In aabcaabxaaz, Z[4] = 3: aab starts the string and starts again at position 4. Computing every Z[i] the obvious way costs O(n²) on a string like AAAA…. The Z-algorithm does it in O(n), with one trick: remember the match that reaches furthest right and copy from it. It is simpler than KMP, and once you have Z, pattern matching is one line.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `zArray(S)` | Z[i] for every i: how far S[i..] matches S | O(n) |
| `search(T, P)` | Z on P$T; Z[i] = m means a match | O(n + m) |

Z[0] would be the whole string, so it is left out (the code stores 0 there). The drawing puts S on top and Z under it. For the position being worked on, a copy of S slides under S[i], so you can see the prefix being compared with the text above it. [Show me](#play:box-copies)

## The box

The algorithm keeps a box [l, r]: of all the matches with the prefix found so far, the one that reaches furthest right. Inside the box S[l..r] is a copy of S[0..r − l].

Now take an i inside the box. S[i..r] is a copy of S[i − l..r − l], and we already know Z[i − l]. So Z[i] starts at min(Z[i − l], r − i + 1), with no comparisons. The min matters: the copy is only guaranteed up to r. Past r we know nothing, so we compare. When i is outside the box, Z[i] starts at 0 and we compare from scratch.

Whenever a match ends past r, it becomes the new box. In the drawing the box is tinted, l and r point at its ends, and when a value is copied the mirror S[0..r − l] lights up with an arrow from Z[i − l] to Z[i]. Dashed green cells were copied, never compared. [The box copies values](#example:box-copies)

```check
Q: The box is [l, r] = [4, 9] and Z[2] = 7. Where does Z[6] start before any comparison?
- 7
* 4
- 2
- 0
= i − l = 2, so Z[6] = min(Z[2], r − i + 1) = min(7, 4) = 4. The copy only holds up to r = 9; past that we have to compare.
```

## Why it is linear

Every comparison either fails or succeeds. A position fails at most once, because a failure ends its loop: at most n − 1 failures. A success at S[i + Z[i]] looks at a character past r (anything up to r was copied), and afterwards r moves past it. r only moves right and never passes n, so there are fewer than n successes. Under 2n comparisons in all.

On [all the same letter](#example:all-same), Z[1] = 15 makes one box cover everything and the other fourteen values are copied: 15 comparisons. Turn the box off with the **Compute Z** option and the same string takes 120. [Show me](#play:naive-worst)

## Pattern matching with P$T

Glue the pattern, a separator that occurs nowhere else, and the text: S = P$T. A match with the prefix can never get past the $, so no Z value exceeds m. Z[i] = m exactly where P sits at S[i], which is shift i − m − 1 in T. That is the whole search. [Finding ABAB through P$T](#example:find-pattern) finds three matches, two of them overlapping. [Show me](#play:find-pattern)

```check
Q: P = AB and T = CABAB. On S = AB$CABAB, which positions have Z[i] = 2?
- 3 and 5
* 4 and 6
- 1 and 4
- Only 4
= S[4..5] and S[6..7] are both AB. Shifts in T: 4 − 2 − 1 = 1 and 6 − 2 − 1 = 3.
```

## When to use it

Use it as a linear-time matcher when you want something short and easy to get right: the loop is about eight lines and there is no table to build first. It also answers questions KMP's table does not answer directly, such as "how long is the longest prefix that starts here?" for every position, which shows up in string periods, in compression and in contest problems.

Avoid it when the text is a stream or very large: P$T keeps the whole text in memory, and KMP reads the text once without keeping it. For many searches in one fixed text, build a [suffix array](/suffix-array/) instead.

## Common mistakes

- Forgetting the min. Copying Z[i − l] without cutting it at r − i + 1 claims matches nobody checked.
- Off-by-one on the box. Here r is inclusive, so the room left is r − i + 1. Code with a half-open box [l, r) uses r − i. Pick one and stick to it.
- Using a separator that can appear in the text or the pattern. Then a Z value can run from P into T and report nonsense.
- Moving the box on every position, not only when the match reaches past r. The algorithm is still correct, but the copy gets shorter and the O(n) argument breaks.

## Try this

- [One position at a time](#example:one-at-a-time). Before each press, say whether Z[i] comes from the box and what it starts at.
- [No match: nothing reaches m](#example:no-match). Find the AB matches in Z, and the D that stops them.
- Load AAAAAAAAAAAAAAAA, build Z, then switch **Compute Z** to "from scratch" and count again.
- Load a word with a repeat, such as abcabcabd, and predict Z before you build it.
