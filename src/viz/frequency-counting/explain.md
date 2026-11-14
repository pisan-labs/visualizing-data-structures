# Frequency counting

Are "night" and "thing" anagrams? Sort both and compare: g h i n t, twice. Or count: one g, one h, one i, one n, one t, twice. Counting sounds like more work for a five-letter word, and it is. But counts can be kept in one pass, updated one letter at a time, and looked up in O(1), and that is what a lot of string problems need. This page does two of them: grouping anagrams, and the first letter that appears only once.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| group, 26 counts | key each word by its letter counts, group by key in a hash map | Θ(n(k + 26)) |
| group, sorted letters | key each word by its sorted letters | Θ(nk log k) |
| first unique, count then scan | count every letter, then stop at the first count of 1 | Θ(n) |
| first unique, rescan | count each letter by scanning the whole word again | Θ(n²) worst |

For n words of k letters each. Two words are anagrams when they have the same letters the same number of times, in any order. So give every word a key that forgets the order: its 26 letter counts, its *signature*. Anagrams get the same key, and a hash map from key to words puts them together. The picture writes a signature with its zeros left out: "night" is g1h1i1n1t1. The key itself is all 26 numbers. [Show me](#play:count-signatures)

The **Approach** option switches to the naive way: sorted letters as the key for grouping, and rescanning for the first unique letter. Both give the same answers. The variables count the work: `comparisons` is two letters compared, `counts` is one read or write of a letter's count, `lookups` is one hash map get-or-insert, and `naive total` and `pattern total` say what each approach costs on this input.

## Grouping anagrams

[Group by count signature](#example:count-signatures) has eight words: night tops thing below spot elbow pots chin. For each word, 26 counts start at 0 and every letter adds 1 to its own. Then the map: is this key there already? "night" starts group 1, "tops" group 2, and "thing" has the same key as "night", g1h1i1n1t1, so it joins it. Four groups at the end:

- night thing
- tops spot pots
- below elbow
- chin

A word with no anagram is a group of its own. The map never compares two words; it compares keys, by hashing them.

```check
Q: What is the signature of "banana", zeros left out?
- a1b1n1
* a3b1n2
- b1a3n2
- a3n2b1
= Three a's, one b, two n's, in letter order: a3b1n2. Every anagram of banana has the same counts, so the same key.
```

## Sorting is cheaper here

[Group by sorted letters](#example:sorted-letters) uses each word's sorted letters as the key instead: "night" becomes ghint. The groups come out the same. And the cost? 44 comparisons and 8 lookups, against 244 counts and 8 lookups for the signatures.

That is not a typo. A signature costs k counts plus 26 reads to make the key, whatever the word is. A merge sort of five letters takes about 7 comparisons. Five letters is not enough to pay for 26 reads. [Longer words, bigger groups](#example:long-anagrams) has words of six and eight letters, and sorting still wins, 102 to 239. Somewhere around 15 letters, a 26-letter signature starts to win, and by 30 letters it is about half the work.

So why is counting the pattern? Three reasons. It is O(k) per word, not O(k log k), which matters for long strings. The counts are useful on their own, as the next section shows. And counts can be updated one letter at a time: drop a letter, add a letter, two counts change. A sorted key has to be rebuilt. That is what a [sliding window](/sliding-window/) needs to find every place in a long text where some rearrangement of a word starts: a window as long as the word, its counts kept up to date as it slides.

## The first unique letter

Which is the first letter of a word that appears only once? The naive way takes each position in turn and counts its letter by scanning the whole word: n comparisons per position. [Rescan for every letter](#example:rescan) does that on "abracadabra": a appears 5 times, b twice, r twice, and then c, at index 4, once. 5 positions of 11 comparisons each, 55 in all. [Show me](#play:rescan)

The pattern counts every letter once, in one pass, then makes a second pass and stops at the first letter whose count is 1. [Count, then a second pass](#example:first-unique) finds the same c with 11 counts and 5 reads, 16 in all.

When every letter repeats, the rescan goes through all n positions: [No letter appears once](#example:no-unique-letter) does "teammate" in 64 comparisons, and the pattern in 16. The answer is −1.

Is the pattern always cheaper? Nope. [The first letter is unique: rescanning wins](#example:unique-first-letter) is "banana": b appears once, so one scan of 6 comparisons settles it. The pattern still counts all 6 letters first, then reads 1: 7.

```check
Q: The counts of "statistics" are s3 t3 a1 i2 c1. What is the index of the first letter that appears once?
- 0
* 2
- 8
- −1
= The second pass reads s (3), t (3), then a (1). a is at index 2. c also appears once, but later.
```

## Counts in a hash map

26 counts is an array indexed by letter, and the hash map holds the keys. When the alphabet is big or unknown (Unicode text, user ids, numbers), the counts themselves go in a hash map: one entry per distinct value, O(1) expected per update. That is how the same pattern finds the first id that appears once in a log, or checks that two lists hold the same values the same number of times. A map that sends many keys to the same bucket slows every lookup down; [chaining](/hash-chaining/) shows what that looks like.

## Spot it

Reach for this pattern when the problem says:

- **rearrange, in any order, anagram, permutation of**: order does not matter, only how many of each;
- **appears once, appears most, at least k times, duplicates**: a question about how often;
- **the same letters, the same values**: equal as multisets, not as sequences.

Three problems of our own:

- Can the letters of a word be rearranged into a word that reads the same backwards? (Count the letters: at most one may have an odd count.)
- Given a list of product codes, put together the codes that use exactly the same characters. (Group by signature.)
- Votes arrive as a list of names. Of the names that got exactly one vote, which comes first in the list? (Count, then a second pass.)

Look-alikes that call for something else: "does the sentence read the same backwards?" fixes the order, so counts are not enough: compare from both ends with [two pointers](/two-pointers/). "Every place in a long text where an anagram of the word starts" is counts in a sliding window. "Words that start with these letters" is about order and prefixes: a [trie](/trie/).

## When to use it

Use it when the order does not matter and the counts do: anagrams, duplicates, "how many of each", first or most frequent. With a fixed small alphabet an array of counts is the simplest thing that works; otherwise, a hash map.

Avoid the 26-letter array for short one-off comparisons where sorting is just as quick and easier to read, and for anything where order matters (palindromes, prefixes, subsequences).

## Common mistakes

- Using a 26-array for text with capital letters, digits or accents. Count in a hash map, or fold the text to a–z first.
- Keying the map by the count array itself in a language that hashes arrays by identity. Two equal arrays are two different keys; turn the counts into a tuple or a string first.
- Comparing two words' lengths but not their counts. "aab" and "abb" have the same length and the same letters.
- Rescanning the whole word for every letter, O(n²), when one counting pass would do.
- Stopping the first pass early. The counts are only right once every letter has been counted.

## Try this

- [Group by count signature](#example:count-signatures): before you play it, guess the four groups.
- Press Compare, pick this page with other options, and set one side to sorted letters. Fill it with random anagram groups and watch `comparisons` and `counts` on both sides.
- Type `mississippi` and press First unique letter. Then try `swiss`.
- [Count, then a second pass](#example:first-unique): how many counts does pass 1 take, whatever the word?
- Load `listen silent enlist tinsel inlets` and group them. One group, five words.
