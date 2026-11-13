# Embeddings and similarity

A computer can't do arithmetic on the word "kitten". It can do arithmetic on a list of numbers. An embedding gives every word such a list, a vector, chosen so that words used in similar ways get similar vectors. Then "how alike are these two words?" becomes "how close are these two arrows?", and that we can compute.

The words on this page live in two dimensions so you can see them. The numbers are made by hand: people to the right, animals up and to the left, food below. A real model learns hundreds of dimensions from billions of words, and nobody draws those.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| dot product | a · b = a.x·b.x + a.y·b.y | Θ(d) |
| length | \|a\| = √(a · a) | Θ(d) |
| cosine | cos(a, b) = a · b / (\|a\|·\|b\|) | Θ(d) |
| nearest k | score all N words, keep the best k in a heap | Θ(N·d + N log k) |
| analogy | a − b + c, then the nearest k | Θ(N·d + N log k) |

Here d is the number of dimensions (2 here) and N the number of words (12). The cosine is the cosine of the angle between two arrows: 1 when they point the same way, 0 at right angles, −1 when they point opposite ways. SLP3 (chapter 6) uses it as the standard measure of similarity. [Show me](#play:kitten-cosine)

## Dot product against cosine

[Two ways to measure one pair](#example:same-way) works through cat and kitten. cat is (−2, 3.2) and kitten is (−1.1, 1.5). The dot product is (−2)(−1.1) + 3.2 × 1.5 = 2.2 + 4.8 = 7.00. The lengths are 3.77 and 1.86. Divide: 7.00 / (3.77 × 1.86) = 1.00, to two decimals. They point almost exactly the same way.

The dot product grows with length as well as direction. In [Nearest by direction](#example:kitten-cosine), kitten's nearest words by cosine are cat (1.00), dog (0.96) and fox (0.93). Switch to the dot product in [The dot product rewards length](#example:kitten-dot) and dog wins with 7.54 against cat's 7.00. dog points a bit off, but its arrow is the longest on the page, and a long arrow wins dot products against everything on its side.

Normalizing fixes it. Scale every arrow to length 1 and the lengths in the cosine's denominator are all 1, so the dot product *is* the cosine. In [Normalize, and the dot product is the cosine](#example:normalized-dot) the dot product picks cat again, with the same 1.00, 0.96 and 0.93. That's why search systems often normalize their vectors once and then use the cheaper dot product.

```check
Q: a = (3, 4) and b = (4, 3). What is cos(a, b)?
- 24
* 0.96
- 1
- 0.75
= The dot product is 3 × 4 + 4 × 3 = 24, and both lengths are 5. So cos = 24 / (5 × 5) = 0.96.
```

The dot product is not a mistake, though. It is what [self-attention](/self-attention/) computes between a query and a key, and there length means something: a longer query asks more loudly.

## Nearest neighbours with a heap

Finding the k nearest words by brute force is easy: score every word. Keeping the best k as you go is the interesting part. Sorting all N scores would cost Θ(N log N). Instead keep a [min-heap](/binary-heap/) of size k whose top is the *weakest* of the best k so far. A new word only needs one comparison with the top. If it scores lower, it is out. If it scores higher, it replaces the top, which sinks to its place in Θ(log k) swaps.

Step through [Nearest by direction](#example:kitten-cosine) and watch the top of the heap. After the first three words fill it, most words are turned away after one comparison. In [The best words come first](#example:best-first), king, woman and queen are among the first words scored, so after them nothing gets in at all: the cheapest case. With k = 1 ([a heap of one](#example:one-neighbour)) the heap is a single box, and this is just the search for a maximum.

```check
Q: You keep the best 3 words in a min-heap. Its top holds a score of 0.80. The next word scores 0.75. What happens?
- It replaces the top, and the top sifts down
* Nothing: it is weaker than the weakest kept, so it is skipped
- It is pushed, and the heap grows to 4
= The top is the weakest of the best 3. A word that cannot beat it cannot be among the best 3, so one comparison turns it away.
```

The same trick finds the k largest of anything: the top-k tokens when sampling, the best k documents in search. [Quickselect](/quickselect/) is the other way to do it, in Θ(N) on average, if you have all the scores in an array first.

## Analogies

Mikolov et al. (2013) found that trained word vectors do arithmetic: king − man + woman lands near queen. The idea is that the step from man to king means "royal", and taking the same step from woman should give a royal woman. In [king − man + woman](#example:king-queen), the sum is (2.80, 2.20) and the nearest word is queen, 0.99.

There is a catch. The usual analogy test leaves out the three input words. Without that rule the answer here would be woman, the word we started from. Some well-known analogies only work because of this rule, so read them with care.

[A young animal](#example:puppy-kitten) works too: puppy − dog + cat lands nearest kitten (0.99). Score the same sum by the dot product, in [The same analogy by dot product](#example:analogy-dot), and fox wins (4.36 against kitten's 2.75). fox's arrow is long.

## When to use it

Embeddings are how text gets into a neural network: a transformer's first step is to look up each token's vector. They are also how semantic search works. Embed the documents once, embed the question, and return the nearest documents by cosine. Brute force with a heap is fine for thousands of vectors. For millions, systems use approximate indexes (graphs such as HNSW, or clusters) that check a small fraction of the vectors and sometimes miss the true nearest one.

## Common mistakes

- Using the dot product on vectors that are not normalized and expecting it to measure direction. Long vectors win.
- Forgetting to leave out the query word. The nearest word to kitten is always kitten itself, with a cosine of 1.
- Keeping the best k in a max-heap. You need fast access to the weakest of the k, so the top must be the smallest.
- Trusting an analogy because it returned a word. [An analogy with no answer](#example:no-answer) asks for a young fox. There is none, and the search still returns dog with a cosine of 0.27. A nearest word always exists; a good one may not.
- Reading the two axes as meanings. Dimensions of a trained embedding are not "royal" or "animal"; only directions and distances mean something.
- Forgetting where the vectors came from. They are learned from text and carry its biases: Bolukbasi et al. (2016) found that word2vec completes "man is to computer programmer as woman is to" with "homemaker".

## At real scale

The word2vec vectors trained on Google News (2013) give 3 million words and phrases 300 numbers each. GloVe (2014) comes in sizes from 50 to 300. GPT-2 small (2019) has a table of 50 257 tokens with 768 numbers each, about 38.6 million numbers before the model does anything else. Brute force over 3 million vectors of 300 numbers is about 900 million multiplications per query: fine once, slow for every user.

## Try this

- Run Nearest on kitten with the dot product, then turn on Normalize. Which word changes place, and why?
- Run Nearest on cake. Which group do its neighbours come from, and how far down the list does the first word from another group appear?
- [king − man + woman](#example:king-queen): try queen − woman + man. Do you get king back?
- Set k to 5 and run Nearest on dog. How many words get into the heap after it is full?
- Find an analogy that fails. Is it the arithmetic, or the missing word?
