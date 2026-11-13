# Self-attention

A word means different things in different sentences. "Bank" next to "river" is not "bank" next to "loan". So a model that reads text needs a way for each word to look at the other words and pull in what matters. Self-attention is that way. Every word asks a question, every word offers an answer, and each word takes a weighted blend of the answers that fit. It is the core of every transformer, from BERT to the chat models.

Nothing here is learned. The head on this page is made by hand, so you can read it: actions look for animals, small words look for things. A real model learns its weights from billions of words, and its heads are much harder to read.

## The idea

| Step | What it does | Cost |
|---|---|---|
| project | each word's vector x becomes a query q, a key k and a value v | Θ(n · d · d_k) |
| score | every query against every key: S[i][j] = q_i · k_j | Θ(n² · d_k) |
| scale | divide every score by √d_k | Θ(n²) |
| mask | a word may not see the words after it: those scores become −∞ | Θ(n²) |
| softmax | turn each row of scores into weights that add up to 1 | Θ(n²) |
| blend | each word's output z_i = Σ_j A[i][j] · v_j | Θ(n² · d_v) |

Here n is the number of words, d the width of a word's vector (4 here) and d_k the width of a query or key (2 here). Three questions per word. The query says what I am looking for. The key says what I have. The value says what I will pass on if you pick me. [Show me](#play:cat-sat)

## How it works

Start with [The verb finds its subject](#example:cat-sat): the cat sat on the mat. Each word is four numbers: how much of an animal, a thing, an action and a small word it is. Multiplying by three small weight matrices gives each word its query, key and value.

sat's query is (2, 0): I am looking for an animal. cat's key is (2, 0.2): I am an animal. Their dot product is 2 × 2 + 0 × 0.2 = 4, the largest in sat's row. The table in the middle holds every such score, one row per word looking and one column per word looked at.

Then softmax turns each row into weights. After scaling and the mask, sat's row is −1.41 for the, 2.83 for cat and 0 for sat. Take e to each, add them up, divide: cat gets 0.93. So sat's output is 93% cat's value. The verb now knows who sat.

```check
Q: Word i has query (1, 2). Word j has key (3, −1). What is the score q_i · k_j before scaling?
- 5
* 1
- 7
- −1
= Multiply the matching entries and add: 1 × 3 + 2 × (−1) = 3 − 2 = 1.
```

Not every row is interesting. cat's query is (0, 0) in this head, so every score in its row is 0 and it spreads its weight evenly. That is fine. A real model has many heads (12 per layer in GPT-2 small), and each one looks for something different. This one only cares about verbs and their subjects.

## Why divide by √d_k

Dot products grow with the width of the vectors. With keys of width 64, adding up 64 products gives scores in the tens, and softmax of large numbers is all-or-nothing: one word gets almost everything and the rest get nothing. Worse, the gradient of a saturated softmax is close to 0, so training stalls. Vaswani et al. divide by √d_k, which keeps the scores about the same size whatever the width (the standard deviation of a dot product of random vectors grows like √d_k).

Compare [Without dividing by √d_k](#example:no-scaling) with the scaled version. With d_k = 2 the difference is small: sat gives cat 0.98 instead of 0.93. With d_k = 64 you divide by 8, and it matters a lot.

## The causal mask

A model that writes text one word at a time must not see the future while it learns, or predicting the next word is trivial: just look. The causal mask sets every score above the diagonal to −∞, softmax turns those into 0, and each word sees only itself and the words before it. GPT-style models (decoders) use it.

Turn it off and you get an encoder like BERT, where every word sees the whole sentence. In [Every word sees every word](#example:no-mask), the second the looks for a thing and finally finds the mat (0.52). With the mask on it couldn't: the mat comes after it.

```check
Q: With the causal mask, which scores can the 3rd word in a sentence use?
- Only its own
* Its own and those of the 1st and 2nd words
- All the words in the sentence
- Only the words after it
= Word i sees words 1 to i. The 3rd word sees the first two and itself.
```

## Word order

Attention on its own does not know where a word is. In [Attention does not know word order](#example:same-word-twice), with no mask, the two cats get exactly the same row: same embedding, same query, same key, same weights. Shuffle the words and every word's output stays the same; only the order of the rows changes. Attention treats a sentence as a bag of words.

That is why transformers tell each word where it is: sinusoids added to its vector in the original paper, rotations of the queries and keys in many models since. With the mask on the two cats differ, but only because the mask is the one thing here that knows positions.

## When to use it

Attention is the right tool when any word may need any other word, however far away: a pronoun and the noun it refers to, a closing bracket and its opening one. [Who is "it"?](#example:it-dog-or-ball) shows the soft version: it leans to dog (0.45) but gives ball a share (0.24). Attention never makes one hard choice; it blends.

The price is the n² table. Double the context and the work and memory quadruple. At 100 000 tokens that is ten billion weights per head per layer, which is why long-context models avoid storing the table (FlashAttention computes it in tiles), and why generating text keeps the old keys and values around instead of recomputing them (the KV cache). For short inputs, n² is nothing to worry about.

## Common mistakes

- Softmax down the columns instead of along the rows. Each word's weights (a row) add up to 1.
- Masking after softmax. Setting weights to 0 afterwards leaves the row adding up to less than 1. Mask the scores with −∞ first.
- Forgetting the scale. It works on toy examples and falls apart at real widths.
- Mixing up keys and values. The key decides who gets picked; the value is what gets passed on. In this head small words have keys that point away, so nobody picks them, even though their values are 0 anyway.
- Reading attention weights as an explanation. A large weight means "this value got blended in", not "the model reasoned about this word". [An untrained head](#example:random-head) has large weights too.
- Computing exp of large scores directly. Subtract the row's largest score first; softmax gives the same answer and exp never overflows.

## At real scale

The toy here has 4 numbers per word and keys of width 2. GPT-2 small (2019) has vectors of 768 numbers, 12 heads per layer with keys of width 64, 12 layers, and a context of 1024 tokens. One head's table is 1024 × 1024, about a million weights, and there are 144 of them per pass. Same arithmetic, just more of it.

## Try this

- [The verb finds its subject](#example:cat-sat): load "the fox ran under the tree". Who does ran look at?
- Load "the cat sat on the mat", turn the mask off and step to the softmax of the first the. Why does it pick the mat now?
- [One word attends to itself](#example:one-word): what is its weight, and why can it be nothing else?
- Switch the head to random weights and load the same sentence a few times. Do any of the random heads look like the hand-made one?
- In [Who is "it"?](#example:it-dog-or-ball), change ball to fox. Who gets it now?
