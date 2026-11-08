# Longest palindromic subsequence

A palindrome reads the same forwards and backwards: RACECAR, ABBA, a single letter. Given a string, find the longest subsequence that is a palindrome. A subsequence keeps the order and may skip characters, so in BBABCBCAB you can keep seven of the nine: BABCBAB. A string of n characters has 2ⁿ subsequences, and we are not going to check them one by one.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the table | L[i][j] for every piece s[i..j] | Θ(n²) time and space |
| Trace back | Walks in from both ends and reads off one palindrome | O(n) |

Let L[i][j] be the length of the longest palindromic subsequence of the piece from character i to character j. Look at the two ends of the piece.

- If s[i] = s[j], they can be the two ends of the palindrome, wrapped around the best palindrome inside: L[i][j] = L[i + 1][j − 1] + 2.
- If not, at least one of them is left out. Drop the left end or drop the right end, whichever is better: L[i][j] = max(L[i + 1][j], L[i][j − 1]).

A single character is a palindrome of length 1, so L[i][i] = 1.

## Filling by length

Here is the catch. L[i][j] reads L[i + 1][j], the row below. Filling row by row from the top would read cells that are still empty. Every cell reads shorter pieces, so fill by the length of the piece instead: first the main diagonal (length 1), then the diagonal next to it (length 2), and so on out to the top-right corner, which covers the whole string. Only the upper triangle is used; i ≤ j. [Show me](#play:length-seven)

Press **Fill one length** to fill one diagonal at a time. [One length at a time](#example:by-length) is a short one to start with.

```check
Q: For the piece ABA, the table has L[2][2] = 1 (B). What is L[1][3]?
- 2
* 3
- 1
- 4
= The ends match (A and A), so L[1][3] = L[2][2] + 2 = 3. ABA is a palindrome.
```

## Which palindrome?

Put a pointer at each end and start in the top-right corner. If the two characters match, they are the two ends of the palindrome: take both and move both pointers in. If not, drop the end the table says loses nothing. When one character is left, it goes in the middle. The palindrome fills in from both ends at once. [An even palindrome has no middle](#example:even-length).

When dropping either end gives the same length, the walk has to choose. The option under Options decides, and [the other choice finds another palindrome](#example:tie-left) of the same length.

## LCS with the reverse

A palindrome is the same forwards and backwards, so a palindromic subsequence of s is also a subsequence of s reversed. That means the longest palindromic subsequence has the same length as the longest common subsequence of s and its reverse. You could run the LCS table on BBABCBCAB and BACBCBABB and get 7 too. Same Θ(n²), different table. The direct version here uses half the cells, and its walk always reads off a palindrome; an LCS walk on the reverse can return a common subsequence that is not one.

```check
Q: What is the length of the LCS of ABCA and its reverse, ACBA?
- 2
* 3
- 4
- 1
= The longest palindromic subsequence of ABCA is ABA or ACA, length 3. The LCS with the reverse has the same length.
```

## When to use it

Palindromes turn up in string puzzles, in DNA (some sequences fold back on themselves), and as a classic interview question: "fewest deletions to make a palindrome" is n − L[1][n]. Use the table for strings up to a few thousand characters. For the longest palindromic substring, where the characters must be next to each other, use Manacher's algorithm instead; it is linear.

## Common mistakes

- Filling row by row from the top. The cell below is still empty.
- Mixing up subsequence and substring. ABCBXA has the subsequence ABCBA, but its longest palindromic substring is BCB.
- Forgetting the length 2 case: two equal characters give 2, and there is nothing inside to read.
- Reading the answer from L[n][n]. It is in the top-right corner, L[1][n].

## Try this

- [A palindrome already](#example:whole-word) and [no repeated letters](#example:all-different).
- Type `CHARACTER`, press **Load**, and guess the length before you fill the table.
- Type `AAAAAA`. Every cell is j − i + 1. Why?
