# Suffix array and LCP

Write down every suffix of BANANA: BANANA, ANANA, NANA, ANA, NA, A. Sort them. Write down where each one starts. That list of numbers, 5 3 1 0 4 2, is the suffix array. It sounds like a party trick. It turns out to answer a surprising number of questions about a text.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| build (prefix doubling) | sorts the suffixes | O(n log² n) |
| LCP (Kasai) | the common prefix of each pair of neighbours | O(n) |
| `search(P)` | every position where P occurs | O(m log n) for \|P\| = m |
| longest repeat | the longest substring that occurs twice | O(n) |

Every occurrence of a pattern P is the start of some suffix. Sort the suffixes and all the ones that start with P sit together, in one block of rows. Binary search finds the block. [Show me](#play:banana)

LCP[i] is the length of the longest common prefix of the suffixes in rows i - 1 and i. For BANANA it is 0 1 3 0 0 2: ANA and ANANA share 3 characters.

## How it works: building the array

The obvious way is to sort the suffixes like any strings. Set **Build by** to comparing suffixes directly and watch [insertion sort do it](#example:insertion-sort): 12 suffix comparisons for BANANA. The trouble is that one comparison can read a whole suffix. On [AAAAAAAA](#example:all-same) every comparison does. That is O(n) per comparison, and O(n³) in all with insertion sort.

Prefix doubling, the default, never compares characters after the first round. It works in rounds:

1. Rank every suffix by its first character.
2. Pair each suffix's rank with the rank of the suffix k positions later (-1 past the end). The pair sorts the first 2k characters.
3. Sort by the pairs and hand out new ranks, with equal pairs sharing one.
4. Double k. Stop when every rank is different.

After round r the suffixes are sorted by their first 2^r characters, so about log₂ n rounds are enough. BANANA takes 2. The shaded part of each row is how much is sorted so far. [Show me](#play:banana)

```check
Q: After the round with k = 2, how many characters of each suffix are sorted?
- 2
- 3
* 4
- All of them
= The pair (rank[i], rank[i + 2]) covers characters 0-1 and 2-3, so the first 4 characters are in order.
```

## How it works: LCP in linear time

Comparing every row with the row above costs O(n²) in the worst case. Kasai's trick is to visit the suffixes in text order: the suffix at 0, then at 1, then at 2. If the suffix at i shares h characters with the row above it, then the suffix at i + 1 (the same thing, minus its first character) shares at least h - 1 with the row above it. So h never starts from zero again; it drops by at most 1 per position and goes up at most 2n times in all.

Watch the narration in [MISSISSIPPI](#example:mississippi): it keeps saying that the first few characters are known to match, so comparing starts after them.

## Searching and repeats

To find P, binary search twice: once for the first row whose suffix is not smaller than P, once for the first row past the block. Every row in between starts with P. [Searching BANANA for ANA](#example:search-ana) finds rows 1 and 2, positions 3 and 1, in 5 probes. [Show me](#play:search-ana) If P is not there, the two searches meet at the row where P would go: [NAB](#example:not-there).

The longest repeated substring falls out of the LCP array. A substring that occurs twice starts two suffixes, and the longest common prefix of any two suffixes is the common prefix of two neighbours. So read off the largest LCP. In [MISSISSIPPI](#example:mississippi) that is 4: ISSI, at positions 1 and 4. The copies may overlap. [Show me](#play:mississippi)

```check
Q: The largest value in the LCP array of a text is 0. What does that tell you?
- The text is sorted
* No character appears twice
- The text is empty
- The suffix array is wrong
= LCP 0 everywhere means no two suffixes start with the same character, so every character is different. Then no substring repeats.
```

## When to use it

Use a suffix array when you search one text many times: a genome, a book, a log file. You pay for the build once, and every search after that is O(m log n) without touching most of the text. It also answers longest repeat, distinct substrings and longest common substring of two strings (glue them together with a separator). It does the same jobs as a suffix tree in a fraction of the memory: one integer per character, plus one for LCP.

Avoid it for a single search (KMP is O(n + m) and needs no build), or for a text that keeps changing, since one edit can move every row.

## Variants

Most textbooks add an end marker $, smaller than every letter, so no suffix is a prefix of another. This page does not; a suffix that is a prefix of another simply sorts first, as in a dictionary, which is why A comes before ANA. Real libraries build in O(n) (SA-IS, DC3) or sort the pairs with radix sort for O(n log n). The rounds are the same idea.

## Common mistakes

- Sorting copies of the suffixes. Keep the start positions and compare in place, or you use O(n²) memory.
- Off-by-one in LCP: LCP[i] compares row i with row i - 1, not i + 1. LCP[0] has nothing above it.
- Stopping the first binary search at any row that matches. You want the first one, then the last one.
- Forgetting that the occurrences come out in sorted order of suffix, not in order of position. Sort them if you need them left to right.
- Reading the longest repeat from the longest suffix. It comes from the largest LCP.

## Try this

- [Every letter different](#example:distinct): ALGORITHM is sorted by first characters alone, with no doubling rounds, and every LCP is 0.
- [One letter repeated](#example:all-same): count the rounds, then switch **Build by** and count the comparisons.
- Load your name and press Longest repeat.
- Search BANANA for A, then for AN, then for ANAN. How does the block shrink?
