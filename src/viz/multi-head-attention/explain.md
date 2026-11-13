# Multi-head attention

One [self-attention](/self-attention/) head computes one set of weights per word. That is a problem when a word needs several things at once. A verb wants to know who did it. A noun wants its article. A pronoun wants both a person and a thing. One softmax row has to split its weight between all of them, and it does each badly.

Multi-head attention runs several heads side by side, each with its own queries and keys, so each can look for something different. Then it glues their outputs together and mixes them. Vaswani et al. (2017) use 8 heads. Grouped-query and multi-query attention go the other way on keys and values: several query heads share one key and value head, which makes the KV cache much smaller when a model generates text.

As on the self-attention page, the heads here are made by hand so you can read them. Each pattern is one column of W_Q, W_K and W_V.

## The idea

| Step | What it does | Cost |
|---|---|---|
| project | Q = X·W_Q (n × d_model), K and V (n × h_kv·d) | Θ(n · d_model²) |
| split | head i gets columns i·d to i·d + d − 1 of Q, with d = d_model / h | free |
| attend | each head: scores, scale by √d, mask, softmax, blend its values | Θ(n² · d) per head |
| concatenate | the h outputs side by side: n × d_model again | Θ(n · d_model) |
| output projection | O = Z·W_O | Θ(n · d_model²) |

Here n is the number of words, d_model the width of a word's vector (4 here), h the number of query heads and h_kv the number of key and value heads. More heads do not cost more: h heads of width d_model / h do the same multiplications as one wide head. [Show me](#play:cat-sat)

## How it works

Start with [Four heads, four patterns](#example:cat-sat): the cat sat on the mat, four heads of width 1. Each head's query and key are a single number, so its score is one multiplication.

- Head 1, who did it: an action looks for an animal. sat gives cat 0.98.
- Head 2, which thing: a small word looks for a thing. Under the mask the second the cannot see mat yet, so this head has nothing clear to say here.
- Head 3, what happened to it: a thing looks for an action. mat gives sat 0.92.
- Head 4, its article: a noun looks for a small word. cat gives the first the 0.90.

The four outputs go side by side, four numbers per word again, and W_O mixes them. After that, each output number can use what every head found.

Now try [One head does it all](#example:one-head): the same four patterns in one head of width 4. Its scores add the patterns up, and one softmax has to share its weight between them. sat → cat drops to 0.84 and mat → sat to 0.43. That's the case for several heads.

With two heads, [Two heads of width 2](#example:two-heads), head 1 is exactly the head from the self-attention page: sat gives cat 0.93 on both pages.

```check
Q: A model has d_model = 512 and 8 heads, as in Vaswani et al. How wide is each head's query?
- 512
* 64
- 8
- 4096
= The heads split the width: 512 / 8 = 64. Each head has a narrow query, and together they cost what one wide head would.
```

## Sharing keys and values: GQA and MQA

When a model writes text, it keeps K and V for every word so far, so the next word does not have to recompute them. That cache grows with every word, and with long contexts and many conversations at once it can take more memory than the weights. With h_kv key and value heads of width d, it holds 2 · h_kv · d numbers per word, per layer.

Multi-query attention (Shazeer 2019) keeps all the query heads but gives them one shared key head and one shared value head. Grouped-query attention (Ainslie et al. 2023) sits in between: groups of query heads share a key and value head. Ainslie et al. build a GQA model from a trained multi-head one by averaging the key and value heads in each group, then training a little more. The averaging is what this page does, without the training.

In [Grouped-query: two heads per key](#example:gqa), heads 1 and 2 share a key and value head, and so do heads 3 and 4. K and V are half as wide, and the cache drops from 8 numbers per word to 4. The price shows in the weights: sat still finds cat (0.89), but mat no longer finds sat. In [Multi-query: one key for all](#example:mqa) the cache is 2 numbers per word, and no head has a clear favourite left. A real model trained this way learns keys that suit sharing, so the loss is much smaller than here. The memory saving is real either way.

```check
Q: A layer has 32 query heads of width 128 and uses grouped-query attention with 8 key and value heads. How many numbers does it cache per word?
- 8192
* 2048
- 1024
- 256
= K and V, each 8 heads × 128 = 1024 numbers: 2 × 1024 = 2048 per word. Multi-head attention would need 2 × 32 × 128 = 8192, four times as many.
```

## When to use it

Every transformer uses several heads; the question is how many key and value heads. Multi-head attention keeps the most detail. Multi-query saves the most memory and memory traffic while generating. Grouped-query is a common compromise in large open models, Llama 2 70B and Mistral 7B among them. Training costs about the same either way; sharing pays off when serving many long conversations at once.

## Common mistakes

- Thinking more heads means more work. The heads split d_model between them; the multiplications stay the same.
- Thinking GQA makes attention compute cheaper. It makes the cache smaller and the reading of it faster. Every query head still scores every word.
- Forgetting W_O. Without it, head 1's output stays in its own columns and the next layer can't combine the heads.
- Splitting the wrong way. Heads split the columns (the features) of Q, K and V, never the rows (the words). Every head sees every word.
- Expecting every head to have a job you can name. A few heads in trained models do (some look at the previous token), many don't.
- Counting the cache per model instead of per layer. Every layer has its own K and V, so multiply by the number of layers.

## At real scale

Vaswani et al. (2017): d_model = 512, 8 heads of width 64. GPT-2 small (2019): 768, 12 heads of 64, all multi-head. Mistral 7B (2023) has 32 query heads and 8 key and value heads. Llama 2 70B (2023) has 64 query heads of width 128, 8 key and value heads and 80 layers. Its cache holds 2 × 80 × 8 × 128 = 163 840 numbers per token; at 2 bytes each, 320 KiB. With one key and value head per query head it would be 8 times as much, 2.5 MiB per token, about 10 GiB for one 4096-token conversation. The toy here caches 8 numbers per word. Same idea, smaller numbers.

## Try this

- [Four heads, four patterns](#example:cat-sat): load "the fox ran under the tree". Which head finds what?
- [Who is "it", head by head](#example:pronoun): which heads care about it, and do they agree?
- Switch [Four heads, four patterns](#example:cat-sat) from multi-head to grouped-query to multi-query. Watch the K panel narrow and the KV cache readout fall.
- Set 2 query heads and choose grouped-query. Why is it the same as multi-query here?
- [One word, four heads](#example:one-word): why is every weight 1?
