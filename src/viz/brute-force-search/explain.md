# Brute-force string search

Press Ctrl-F, type a word, and the browser finds it in the page. The simplest way to do that: put the word under the start of the text and compare letter by letter. When two letters disagree, slide the word one place to the right and start over. When all of them agree, you have found it, and you slide on anyway, in case it turns up again. That's brute-force string search. CLRS calls it the naive string matcher.

It is worth knowing well. KMP, Boyer-Moore and Rabin-Karp are three different answers to one question: how do we do less of this?

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `search(T, P)` | Returns every shift where P occurs in T | O(mn) worst case, close to O(n) on ordinary text |

T has n characters and P has m. A shift s puts P[0] under T[s], so P covers T[s..s + m − 1]. The shifts that fit go from 0 to n − m. At each one, compare P[j] with T[s + j] for j = 0, 1, 2 and so on, and stop at the first pair that differs. If all m agree, P occurs at shift s. [Show me](#play:two-matches)

Each shift gets its own row under the text, and the earlier rows stay above the current one, faded, so you can see how far each got. Green cells matched. A red cell with a slash is the mismatch that ended a shift. A purple row is a match, and a purple bar over the text marks each match found so far. **Next alignment**, under More operations, runs one shift at a time.

## The text pointer goes back

Call the next character of the text to compare i, so i = s + j. In [Two matches](#example:two-matches), shift 1 matches ABABA, five characters, before T[6] = B meets P[5] = C. Brute force slides P one place and starts again at T[2]. The pointer i goes back from 6 to 2.

Those four characters are not a mystery. The search has just seen them, and it knows exactly what they are: they matched P[1..4]. It throws that away and compares them again. [KMP](/kmp/) is what you get when you refuse to throw it away. Its text pointer never moves back.

```check
Q: Brute force is at shift s. P[0..3] matched, and T[s + 4] ≠ P[4]. Which character of T does it compare next?
* T[s + 1], with P[0]
- T[s + 4], with P[0]
- T[s + 5], with P[0]
- T[s + 4], with P[1]
= It slides P one place, to shift s + 1, and starts again at P[0]. T[s + 1] is under P[0] now, three places back from where the mismatch was.
```

## Counting comparisons

A shift costs one comparison if its first characters differ, and m if it gets to the end (a match, or a mismatch at P[m − 1]).

- [No Q in the text](#example:best-case): every shift fails at once, so 10 shifts take 10 comparisons. That's n − m + 1, the best case.
- [AAA…AB and AAAB](#example:worst-case): every shift matches three As before the B fails, and the last one matches. 13 shifts of 4 comparisons is 52, which is m(n − m + 1), the worst case. [Show me](#play:worst-case)
- [Overlapping matches](#example:overlapping): ABABA occurs at 0, 2 and 4. Each match costs all m comparisons, whatever the algorithm.

On ordinary text the average is much closer to the best case. With random letters from an alphabet of σ, a shift gets to its second comparison with probability 1/σ, to its third with probability 1/σ², and so on. That's fewer than σ/(σ − 1) comparisons per shift: under 2 even with two letters, and about 1.04 with 26. Brute force is fine for a short word in English text. It is slow when the text and the pattern repeat the same few characters, as DNA (four letters) and binary data (two) tend to do.

```check
Q: T is twenty As and P is AAA. How many comparisons does brute force make?
* 54
- 18
- 20
- 60
= There are 20 − 3 + 1 = 18 shifts, and every one of them is a match: 3 comparisons each, so 54.
```

## When to use it

Use it for a short pattern in ordinary text, or for a search you run once. There is no preprocessing, no extra memory, and very little to get wrong. It is also the first thing to write when you test a cleverer matcher: run both on lots of random inputs and compare the answers.

Avoid it when the text and the pattern are long and repetitive, or when you will search for the same pattern many times. Then the preprocessing of [KMP](/kmp/) or [Boyer-Moore](/boyer-moore/) pays for itself.

## Common mistakes

- Stopping one shift early. `for s in range(n - m)` never tries s = n − m, so a match at the very end of the text is lost.
- Running s past n − m. Near the end, T[s + j] falls off the end of the text: an exception in Python and Java, undefined behavior in C++.
- In C++, writing `s <= n - m` with `size_t` sizes when the pattern can be longer than the text. n − m wraps around to a huge number. [A pattern longer than the text](#example:too-long) should find nothing, without crashing.
- Jumping past a match. Sliding by m after a match skips overlapping matches: ABA occurs in ABABA at 0 and at 2.

## Try this

- [Two matches](#example:two-matches). Before each shift, guess how far it gets.
- [The worst case](#example:worst-case), then [the best case](#example:best-case). Compare the counters.
- [No match](#example:no-match). Even with nothing to find, every shift costs at least one comparison.
- Press Compare and pick Knuth-Morris-Pratt to run both on the same text.
- Start over with the worst case and 24 characters. Before you search, work out how many comparisons it will take.
