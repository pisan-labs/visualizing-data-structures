# Burrows-Wheeler transform

Here is a strange recipe. Take a word, write down every rotation of it, sort the rotations, and keep only the last column. banana becomes annb$aa. That looks like a scramble, and you might expect to have thrown information away. You have not: the last column alone gets banana back. And the scramble has a useful habit. It puts equal letters next to each other, which is why bzip2 runs it before compressing. Burrows and Wheeler published it in 1994 as a technical report. It now sits inside DNA aligners too.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `bwt(text)` | Sort the rotations of text + $, read the last column L | O(n log n) as drawn; O(n) via a suffix array |
| `inverse(L)` | Get the text back from L alone | O(n) |

The $ is an end marker. It occurs once and sorts before every letter, so the row that starts with it is always row 0. [Sorting the rotations of banana](#example:banana) [Show me](#play:banana)

## Why letters bunch up

Each row's last character is the one that comes just before the row's first characters in the text. Sorting puts rows with the same beginning together. So L lists, in order, the characters that come before each context. In English, the letter before "he" is very often t. In banana, both rows that start with "na" are preceded by an a. Similar contexts, similar letters, and L comes out in runs.

[Repeats make runs](#example:repeats-make-runs): abcabcabc becomes ccc$aaabbb, 4 runs in 10 characters. The transform itself saves nothing; it only reorders. Compression comes after: move-to-front turns a run into zeros (a letter you just saw is at the front of the list), run-length coding squeezes the zeros, and Huffman or arithmetic coding finishes the job. That is bzip2.

```check
Q: What is the transform of abab$ (the word abab with its marker)?
- baba$
* bb$aa
- $aabb
- abab$
= Sorted, the rotations are $abab, ab$ab, abab$, b$aba, bab$a. Their last characters are b, b, $, a, a.
```

## Getting the word back

All you have is L. Every column of the sorted rotations holds the same characters, so F, the first column, is just L sorted.

Now the key fact, LF-mapping: the k-th copy of a letter in L and the k-th copy of that letter in F are the same character of the text. Rows that start with a are sorted by what follows the a. Rows that end with a, rotated by one, are those same rotations and sort the same way. So their order agrees.

And L[r] is the character just before F[r] in the text. Start at row 0, which is $ followed by the whole text, so L[0] is the text's last character. Write it down, find the same copy in F, and repeat: each step puts one more character in front. The drawing numbers the copies and draws the LF arrow for each step. [Getting banana back from annb$aa](#example:invert-banana) [Show me](#play:invert-banana)

```check
Q: L = annb$aa, so F = $aaabnn. L[2] is the second n in L. Which row of F holds the same n?
- 2
- 5
* 6
- 1
= The n's in F start at row 5, so the second n is row 6.
```

## End marker or index

The original paper had no $. It kept the row where the original word landed after sorting, an index, and the inverse started its walk there. Same idea, one extra number to store. With **End of the word** set to "keep the row", banana gives L = nnbaaa and index 3. [No end marker: keep the index](#example:index-instead)

The $ version has a bonus. Because $ occurs once and sorts first, sorting the rotations is the same as sorting the suffixes. The "start" column is the [suffix array](/suffix-array/). That is how real tools compute the transform: build the suffix array in linear time, then L[i] = S[SA[i] − 1]. Nobody sorts n rotations of a million characters.

## When to use it

Use it in front of a compressor when the data has repeated contexts: text, source code, DNA. It is also the heart of the FM-index, which searches a compressed text for a pattern without decompressing it. Read aligners such as BWA and Bowtie work this way.

Avoid it for streams and short messages. It needs the whole block before it can sort, which adds latency, and on short or random data there are no contexts to exploit. [LZ77 and LZW](/lz-compression/) work on a stream as it arrives.

## Common mistakes

- Forgetting the end marker, or the index. Without one of them, banana and ananab's rotations are indistinguishable: every rotation of a word has the same transform.
- Sorting $ after the letters. Then it is not row 0 and the walk starts in the wrong place.
- Reading the first column instead of the last. F is just the letters sorted, which anyone could compute.
- Matching the k-th copy in L with the wrong copy in F. Count from the top in both.

## Try this

- [One letter: a single run](#example:one-letter). Why is the $ last in L?
- Load mississip and count the runs in L.
- Load a word, press Transform, then switch to "keep the row" and transform again. Which rows move?
- Press Invert without Transform: the page starts from the transform of the loaded word.
