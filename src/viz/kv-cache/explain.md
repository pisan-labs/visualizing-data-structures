# KV cache

A language model writes one token at a time. Each new token runs through [self-attention](/self-attention/): its query is scored against the key of every token before it, and it takes a blend of their values. So every step needs the keys and values of the whole text so far. You can compute them again, every step. Or you can keep them. Keeping them is the KV cache, and it is nothing fancy: two lists of rows, one row added per token.

On this page you type the words that come next. A real model would pick each word from the last output, but that is a different page. This one is about the cost.

## The idea

| Operation | What it does | Cost (one head, one layer) |
|---|---|---|
| prefill(prompt) | the whole prompt at once: Q, K and V in one matrix product each, then every token attends to the ones up to it | Θ(n · d · d_k + n² · d_k) |
| generate, with the cache | one new row of K and of V, appended; the new query attends to the cache | Θ(d · d_k + t · d_k) |
| generate, without | K and V again for every token so far | Θ(t · d · d_k) |
| memory | a row of K and a row of V per token | Θ(t · d_k) |

Here d is the width of a token's vector (4 here), d_k the width of a key (2 here), n the prompt's length and t the tokens so far. The head is the hand-made one from the self-attention page, so every number matches that page. [Show me](#play:cache-grows)

## How it works

Work is counted in multiply-adds. One row of x (4 numbers) times a 4 × 2 weight matrix is 8. Scoring a query against one key is 2, and blending in one value is 2 more.

Start with [The cache grows one row per token](#example:cache-grows). Prefill reads "the dog saw the ball" in one go. Q, K and V for 5 tokens cost 3 × 5 × 8 = 120. Then each token attends to itself and the ones before it: 1 + 2 + 3 + 4 + 5 = 15 scores and 15 blends, another 60. That is 180 multiply-adds, and the cache now holds 5 rows of K and 5 of V, 20 numbers.

Then "and". Only the new token is projected: q, k and v cost 24. Its k and v go on the end of the cache. Its query is scored against 6 keys and blends 6 values, 24 more. In all 48. "it" costs 52 and "ran" 56. Each token costs 4 more than the one before: one more key to score, one more value to blend. The cache saves the projections, not the attention.

```check
Q: With the cache, a new token sees 10 tokens (itself included). How many multiply-adds does its step take, counting 8 per row of q, k or v and 4 per token seen?
- 40
* 64
- 208
- 24
= q, k and v cost 3 × 8 = 24, and attending to 10 tokens costs 10 × 4 = 40: 64. Without the cache it would compute K and V for all 10 again, 8 + 160 + 40 = 208.
```

## Without a cache

[Without a cache, every token starts over](#example:no-cache) runs the same text. The outputs are exactly the same, to the last bit. The cost is not: "and", "it" and "ran" cost 128, 148 and 168 instead of 48, 52 and 56. Each step computes K and V for every token again, so each token costs 20 more than the last instead of 4. Over the whole text that is 624 multiply-adds against 336, and the **recomputed rows** counter ends at 18: 18 rows computed for tokens that already had them.

With one layer, the keys and values are the only waste. A real model is worse. A token's key in layer 2 depends on its output from layer 1, so without a cache the whole model runs again over the whole text for every new token.

Why is there no Q cache? A query is used once, by its own token, at its own step. Later tokens never look at it. They only need the keys (to be scored) and the values (to be blended). Watch the **q** panel: it only ever holds one row.

```check
Q: Why does the cache keep K and V but not Q?
- Queries are too large to keep
* A token's query is used only at its own step; later tokens use only the earlier keys and values
- Q can be computed from K and V
- The causal mask hides the earlier queries
= The new token's query is scored against the old keys and blends the old values. Nobody ever needs an old query again.
```

## Prefill and decode

Compare [Seven tokens of prompt in one pass](#example:one-pass) with [The same text one token at a time](#example:one-by-one). Same eight tokens, same cache, same 336 multiply-adds, same final output. The difference is the number of passes: one for the prompt, against eight in a row. Decode cannot go faster, because the next token is not known until the last one is out.

That is why serving systems talk about two phases. Prefill is one big matrix product over the whole prompt, which keeps a GPU busy. Decode is one row at a time, so most of its time goes on reading the weights and the cache from memory rather than on arithmetic. The work column shows the same numbers either way. The clock does not.

## A sliding window

The cache grows with the text. A sliding window caps it: each token sees only the last w tokens, itself included, and the cache evicts the oldest row when a new one comes in. In [A window keeps the last three tokens](#example:window), the cache stops at 3 rows (12 numbers) and every token from the third on costs 36, however long the text gets.

There is a catch. The cache never changes the answer; the window does. With the full cache, ran gives dog a weight of .73 and its output is (.67, .22): ran knows who ran. With a window of 3, ran sees only and, it and ran. dog is gone, and the output is (0, 0).

Mistral 7B (2023) uses a window of 4096 tokens with a rolling buffer: token i's key and value go in slot i mod 4096, overwriting the oldest. That is a [circular queue](/queue-array/). Its layers are stacked, so information from beyond one window can still reach a token, one window per layer. A window without a cache is [cheaper than no window](#example:window-no-cache) (68 per token here, flat), but still almost twice the cached 36.

## The cache grows like a dynamic array

Each token appends one row at the end, like append on a [dynamic array](/dynamic-array/). One sequence on its own is easy. A server answers many requests at once, of lengths it does not know in advance, and each one's cache keeps growing. Reserve the full length up front and most of it sits empty; grow it as you go and you copy, or you split the memory into small blocks and keep a table of which block holds what. That last idea is paged attention (Kwon et al. 2023), the same trick an operating system uses for virtual memory.

## When to use it

Any decoder that generates text one token at a time keeps a cache. The price is memory: a row of K and a row of V per token, per head, per layer, for every request in flight. With long texts and many requests at once, the cache can take more memory than the model's weights, which is why models share key and value heads (multi-query attention, Shazeer 2019; grouped-query attention, Ainslie et al. 2023) and why windows exist.

There is nothing to cache when nothing is generated. An encoder like BERT reads the whole input once. Training also sees every position at once, with the causal mask doing the work; the cache is for inference.

## Common mistakes

- Thinking the cache changes the output. It changes the cost; the numbers are the same with it and without it.
- Thinking the cache makes attention cheap. Token t still scores t keys: 48, 52, 56 keeps climbing.
- Caching the queries. Nobody needs an old query.
- Thinking a window is free. It caps memory and work, and it forgets: tokens outside it can no longer be seen.
- Counting the memory for one head. The real cache is 2 × layers × KV heads × head width numbers per token.
- Giving the new token the wrong position. It sits at position t, not 1; the cached keys keep the positions they had.

## At real scale

GPT-2 small (2019) has 12 layers and vectors of 768 numbers (12 heads of 64). Each token adds 2 × 12 × 768 = 18 432 numbers to its cache. At its full context of 1024 tokens that is about 18.9 million numbers, about 38 MB at 2 bytes each, for one sequence. The toy here keeps 4 numbers per token.

## Try this

- In [The cache grows one row per token](#example:cache-grows), turn the cache off. Which numbers change, and which stay exactly the same?
- In [A window keeps the last three tokens](#example:window), step to the softmax for ran. Who did it lose?
- Set the window to 2, prefill "the cat sat" and generate "on the mat". How many numbers does the cache hold at the end? Does the cost per token change once it is full?
- Before you step to it, predict the work for token 8 without the cache. Then check the **work** column.
- Prefill "the fox ran and the dog chased" and generate "it". Then prefill just "the" and generate the other seven words one at a time. Add up the work column both ways.
