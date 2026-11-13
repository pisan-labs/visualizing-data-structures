# Inverted index and BM25

Type "cat mat" into a search box. Which documents should come back, and in what order? You could read every document for every query, but that stops working somewhere around your second thousand documents. Search engines turn the problem around: once, ahead of time, build an index from each word to the documents that contain it. Then a query only touches the documents that share a word with it.

BM25 is how they rank what comes back. It comes from Robertson and colleagues (the Okapi system, 1990s), and it is still a standard baseline that new retrieval methods are compared against. Retrieval-augmented generation often runs it next to an embedding search, because it catches exact words, names and codes that embeddings blur.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| add a document | count its words, append (document, tf) to each word's list | Θ(L) for L words |
| look up a word | one hash-table probe finds its postings list | Θ(1) expected |
| score | for each posting: IDF × a share that grows with tf, adjusted for length | Θ(P) for P postings |
| top k | keep the best k in a min-heap | Θ(R log k) for R documents met |

The index maps each term to its *postings list*: the documents that contain it, each with its term frequency tf, how many times it appears there. "the" is in all six documents of [Two words, one document has both](#example:cat-mat), so its list is d1:2 d2:2 d3:2 d4:2 d5:1 d6:2. [Show me](#play:cat-mat)

## The index

Each word needs one lookup, which is a job for a hash table: see [separate chaining](/hash-chaining/) or [open addressing](/hash-open/). Documents get numbers in the order they arrive, so a new posting always goes on the end of its list and every list stays sorted by document for free. That matters at scale. Sorted lists can be merged in one pass, and gaps between document numbers compress well.

## The score

For a query q and a document d, BM25 adds up one term per query word t:

score(d, q) = Σ IDF(t) · tf / (tf + k₁ · B),  where B = 1 − b + b · |d| / avgdl

Three ideas in one line. **IDF** says rare words matter more: IDF(t) = ln((N − n + 0.5) / (n + 0.5)) for a word in n of the N documents. **The share** tf / (tf + k₁B) is between 0 and 1 and grows with tf, but more and more slowly. **B** is about length: a long document has more words of every kind, so it needs more hits to earn the same share.

Work through [Two words, one document has both](#example:cat-mat). N = 6 documents, average length avgdl = 6 words. "cat" is in 2 of them: IDF = ln(4.5 / 2.5) = 0.59. d1 has 6 words, so B = 0.25 + 0.75 × 6/6 = 1, and its share for one "cat" is 1 / (1 + 1.2 × 1) = 0.45. That adds 0.59 × 0.45 = 0.27. "mat" is in only one document, so its IDF is bigger, 1.30, and d1 gets another 0.59. d1 ends with 0.86. d3 has "cat" too, but no "mat": 0.29. The other four documents are never touched.

```check
Q: With k₁ = 1.2 and B = 1, one occurrence of a word gives a share of 1 / 2.2 = 0.45. What share do two occurrences give?
- 0.91, twice as much
* 0.63
- 0.45, the same
- 1
= 2 / (2 + 1.2) = 0.625. More than one occurrence, but well short of double: the share saturates.
```

## Saturation: k₁

The second "cat" in a document should count, but less than the first. In [Repeats count less and less](#example:saturation), d3 is "cat cat cat cat". Four times the hits of d1, and its share is 0.75 against d1's 0.48: about 1.6 times. With k₁ = 0 ([once is as good as four times](#example:once-is-enough)) the share is always 1, and d1 and d3 tie at 0.59. With a large k₁ the share keeps growing with tf, and a page that repeats a word fifty times would win, which is exactly what spammers used to try. Robertson and Zaragoza (2009) report that k₁ between 1.2 and 2 works well in many collections.

## Length: b

In [A short document wins](#example:length-matters), "the cat" and "the old cat ran under the big tree" both have "cat" once. The short one gets B = 0.64 and a share of 0.56; the long one B = 1.83 and 0.31. A hit in a short document says more about what the document is about. b sets how much: b = 0 ignores length (they would tie), b = 1 divides by it fully. Typical values are between 0.5 and 0.8; 0.75 is the usual default.

## Common words and negative IDF

"the" is in every document. In [A word in every document](#example:every-document) its IDF is ln(0.5 / 6.5) = −2.56: negative. In this form of IDF, a word in more than half the documents counts *against* a document, and the more "the" a document has, the worse it scores. Search for "the cat" and d5, "a dog ate the ball", comes first because it has only one "the". Not what anyone wanted.

Lucene adds 1 inside the logarithm, ln(1 + (N − n + 0.5) / (n + 0.5)), so every IDF is positive. In [An IDF that is never negative](#example:never-negative) "the" gets 0.07 (almost nothing, which is right) and the two documents with "cat" come first. Many systems also drop very common words (stop words) before indexing. With a real collection of millions of documents the problem is mostly theoretical: very few query words are in more than half of them. With six documents, it happens all the time.

```check
Q: A word appears in 3 of 6 documents. What is its IDF, ln((N − n + 0.5) / (n + 0.5))?
- ln 2 = 0.69
* 0
- −0.69
= (6 − 3 + 0.5) / (3 + 0.5) = 3.5 / 3.5 = 1, and ln 1 = 0. A word in exactly half the documents tells them apart not at all.
```

## The top k

After scoring, you only want the best few. Sorting every score costs Θ(R log R). Instead keep a [min-heap](/binary-heap/) of size k whose top is the weakest of the best so far: a new score that can't beat the top is turned away with one comparison. It is the same trick the [embeddings page](/embeddings/) uses for nearest neighbours.

## When to use it

BM25 is good at exact matches: names, product codes, rare technical words, error messages. It needs no training and runs fast on an index, and it explains itself (you can always say which words matched).

It knows nothing about meaning. [A query that matches nothing](#example:no-match) asks for "cats zebra" and gets nothing, though two documents have "cat" in them: "cats" is a different string. Real systems stem words (cats → cat) to help a little. For "kitten" or "feline", you need embeddings. That is why search systems often combine the two: BM25 for the exact words, an embedding search for the meaning, and a merged ranking.

## Common mistakes

- Forgetting the length normalization, so long documents win just by being long.
- Using raw tf (k₁ very large), so repeating a word buys a better rank.
- Trusting the IDF sign. In the original form a very common word gets a negative weight.
- Computing avgdl once and never updating it as documents are added.
- Expecting synonyms or plurals to match. BM25 matches the tokens you give it, nothing more.
- Sorting every score to get the top 10. A heap of 10 is enough.

## At real scale

The toy has at most 6 documents of 8 words. The textbook by Manning, Raghavan and Schütze (2008) uses the Reuters RCV1 collection as its running example: about 800 000 news stories, 400 000 distinct terms and 100 million tokens. A query word's postings list there can hold hundreds of thousands of documents, which is why real indexes compress their lists and skip through them instead of reading every posting.

## Try this

- [Two words, one document has both](#example:cat-mat): search for "dog". Why does the longest document, d6, come first?
- [Repeats count less and less](#example:saturation): set k₁ to 5. How much closer to 4 times d1's share does d3 get?
- [A short document wins](#example:length-matters): set b to 0. What happens to the order?
- [A word in every document](#example:every-document): switch the IDF to the version that is never negative. Who wins now?
- [A short document wins](#example:length-matters) has room for one more document: add "the cat sat on the cat" and search for "cat". Where does it land?
