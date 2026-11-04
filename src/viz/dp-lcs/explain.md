# Longest common subsequence

A subsequence of a string keeps some of its characters, in order, and drops the rest. BDAB is a subsequence of ABCBDAB: keep a B, the D, an A and the last B. A common subsequence of two strings is a subsequence of both, and the longest common subsequence (LCS) is the longest one there is. ABCBDAB and BDCABA have several of length 4, BCBA and BDAB among them, and none of length 5.

Where does this come up? The classic `diff` compares two files by finding an LCS of their lines; whatever is not in it was added or deleted. Comparing two strands of DNA, with A, C, G and T as the characters, is the other textbook example. Trying every subsequence is hopeless, since a string of length m has 2ᵐ of them.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Fill the table | c[i][j] for every pair of prefixes | O(mn) time and space |
| Trace back | Walks back from c[m][n] and reads off one LCS | O(m + n) |

Let c[i][j] be the length of an LCS of X[1..i] and Y[1..j], the first i characters of X and the first j of Y. Look at the last two characters.

- If X[i] = Y[j], that character can end a common subsequence, so c[i][j] = c[i − 1][j − 1] + 1.
- If they differ, at least one of them is not in the LCS. Drop one or the other and keep the better result: c[i][j] = max(c[i − 1][j], c[i][j − 1]).
- An empty prefix has nothing in common with anything, so row 0 and column 0 are all 0.

## Filling the table

Fill row by row, left to right, so the three cells a value needs (up and to the left, above, and to the left) are always ready. The arrows show which ones a cell reads, and the blue one is where its value comes from. On a match, both characters light up. [Show me](#play:length-four)

**Fill one row** (under More operations) stops after each row, so you can predict the next one before it fills. [One row at a time](#example:row-by-row)

```check
Q: X[3] = 'C' and Y[3] = 'C'. The cell up and to the left, c[2][2], holds 1; c[2][3] holds 1 and c[3][2] holds 1. What is c[3][3]?
- 1
* 2
- 3
= A match adds 1 to the diagonal: c[3][3] = c[2][2] + 1 = 2. The other two neighbors only matter when the characters differ.
```

## Tracing back

The bottom-right cell says how long an LCS is, not what it is. To find one, walk back from c[m][n] the way each value was made. On a match, take the character and move diagonally. Otherwise move to the bigger of the cell above and the cell to the left. Stop at row 0 or column 0. The characters come out from the end of the LCS to its start, so read them backwards. In the drawing they drop into place under the table.

CLRS stores an arrow in every cell while filling (the b table) and follows the arrows. This page works the direction out again from the numbers, which gives the same walk without a second table.

## Ties

When the cell above and the cell to the left are equal, either way leads to an LCS of the same length, and often to a different one. CLRS goes up. Set the tie option to go left, and ABCBDAB and BDCABA give BDAB instead of BCBA. The numbers in the table do not change at all. [Show me](#play:tie-left)

```check
Q: With ties going up, the walk finds BCBA. With ties going left, it finds BDAB. Which one is the LCS?
- BCBA, because CLRS goes up
- BDAB, because it is found second
* Both: an LCS need not be unique
= Both have length 4, the longest possible. The table only fixes the length; the walk picks one of the longest.
```

## What it costs

The table has (m + 1)(n + 1) cells and each takes O(1) work, so filling it is O(mn) whatever the strings look like. The walk back moves at least one row or column per step, so it takes at most m + n steps; for [a word and itself](#example:same-string) it goes straight up the diagonal. If you only need the length, two rows of the table are enough, which cuts the space to O(min(m, n)).

## When to use it

Use it when you need what two sequences share, in order: lines of two files, two strands of DNA, two versions of a list. Avoid the full table for long inputs. Two files of 100,000 lines would need 10¹⁰ cells. Real diff tools use algorithms that are fast when the two files are mostly the same.

## Common mistakes

- Mixing up a subsequence with a substring. A substring has to be contiguous; a subsequence can skip.
- Off-by-one errors. The table is (m + 1) by (n + 1), and X[i] in the table is `x[i - 1]` in 0-based code.
- Moving diagonally on a mismatch, or taking a character on a move up or left.
- Reading the LCS forwards while walking back. It comes out reversed.
- Expecting one answer. Many strings can tie for the longest.

## Try this

- [ABCBDAB and BDCABA](#example:length-four). Before the walk starts, guess which characters it takes.
- [Ties go left](#example:tie-left). Same table, a different LCS.
- [No character in common](#example:nothing-common) and [a word and itself](#example:same-string): the two extremes.
- [Two DNA strands of 8 bases](#example:dna). Lots of matches, lots of ties.
- Type two words of your own, such as `STONE LONGEST`, press **Load**, then **Fill the table** and **Trace back**.
