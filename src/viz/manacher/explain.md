# Manacher (longest palindrome)

What is the longest substring that reads the same both ways? The usual first answer is to stand at every center and expand outward while the two sides agree. That is O(n²) on aaaa…, and it needs two passes, one for odd lengths (aba) and one for even (abba). Glenn Manacher's 1975 algorithm does it in one linear pass. It is the same trick as the [Z-algorithm](/z-algorithm/): keep the match that reaches furthest right, and copy from it.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| transform | abba becomes #a#b#b#a# | O(n) |
| `manacher(s)` | P[i] for every cell, and the longest palindrome | O(n) |

The separators fix the odd/even problem. In T = #a#b#b#a#, the even palindrome abba is centered on the # between the b's, so every palindrome now has a center cell. P[i] is the radius of the longest palindrome centered at T[i]. Handy fact: P[i] is also that palindrome's length in the original word. The longest palindrome is wherever P is largest. [Even length: the center is a separator](#example:even-center)

## The mirror

Keep C and R: the center and right end of the palindrome that reaches furthest right so far, R = C + P[C]. Now take a new center i < R. Its mirror across C is i' = 2C − i. Inside the big palindrome the two sides are reverses of each other, so whatever surrounds i' also surrounds i, as far as R. That gives

P[i] = min(P[i'], R − i)

without a comparison. If P[i'] fits inside, that is the answer. If it touches the edge, we only know P[i] is at least R − i, and we expand from there. Past R we know nothing.

In the drawing, the palindrome around C is tinted, C and R point at it, and when a radius is copied, i' lights up with an arrow from P[i'] to P[i]. [A long odd palindrome](#example:long-odd): after abacaba turns up around the c, the centers to its right copy their radii from the left side. [Show me](#play:long-odd)

```check
Q: C = 7 and R = 14. P[5] = 3. Where does P[9] start before any comparison?
* 3
- 5
- 2
- 0
= The mirror of 9 is 2·7 − 9 = 5, so P[9] = min(P[5], R − 9) = min(3, 5) = 3. It fits inside, so 3 is final.
```

## Why it is linear

Same argument as the Z-algorithm. Each center makes at most one failed comparison, since a failure ends its loop. Each successful comparison looks at a cell past R (anything up to R was copied), and then R moves past it. R never moves left and never passes the end of T, so the successes are fewer than N, the length of T. Under 2N comparisons in all. [All the same letter](#example:all-same) takes 19. Switch **Find each radius** to "from scratch" and it takes 100. [Show me](#play:naive-worst)

## When to use it

Use it when you need the longest palindromic substring, or every maximal palindrome (all of P), in linear time: string problems in contests, DNA palindromes, checking which substrings are palindromes in O(1) after O(n) work.

For a word of 20 characters, expanding around every center is shorter to write and fast enough. A dynamic-programming table is the textbook O(n²) answer and costs O(n²) memory too. Manacher wins when n is large. Suffix trees also solve the problem in linear time, with far more machinery.

```check
Q: For the word abba, T = #a#b#b#a#. What is P[4], the radius at the middle #?
- 0
- 2
* 4
- 9
= T[0..8] is the whole of #a#b#b#a#, which reads the same both ways, so the radius is 4: the length of abba.
```

## Common mistakes

- Forgetting the separators and handling only odd palindromes. abba has no center letter.
- Mixing up radius conventions. Here P counts cells on one side in T, which equals the length in the word. Some code puts ^ and $ sentinels at the ends to skip the bounds check, or counts the center too. Check before you divide by 2.
- Using P[i'] without the min. The mirror only holds up to R.
- Getting the start wrong when you map back: the palindrome starts at (i − P[i]) / 2 in the word.

## Try this

- [One center at a time](#example:one-at-a-time) on racecar. Before each press, say whether i is inside [C, R] and what its mirror gives.
- [Nothing longer than one letter](#example:no-repeats): why does every letter cell get exactly 1?
- Load abcbaabcba and predict where R jumps.
- Load a word, build P, and find the second-longest palindrome by reading P.
