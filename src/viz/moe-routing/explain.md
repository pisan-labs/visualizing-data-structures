# Mixture-of-experts routing

A bigger model knows more, but every parameter costs compute on every token. A mixture of experts breaks that link. The feed-forward network of a [transformer block](/transformer-block/) is replaced by several experts, each its own feed-forward network, and a small router sends each token to only one or two of them. The model has the parameters of all the experts and the cost per token of one or two. Mixtral 8x7B (2024) has 47 billion parameters and uses 13 billion of them per token.

The catch is load balancing, the same problem as spreading requests over servers. If the router likes one expert, that expert gets swamped and the rest sit idle. Here, as in Switch Transformer, each expert has a fixed number of slots, so tokens that arrive at a full expert are dropped. This page has four experts and a router made by hand: expert E1 likes animals, E2 things, E3 actions and E4 small words (the, a, on).

## The idea

| Step | What it does | Cost |
|---|---|---|
| score | router logits = x · W_r: each token's score for each of E experts | Θ(T · d · E) |
| softmax | p = softmax of each row: the router's probabilities | Θ(T · E) |
| top-k | each token keeps its k highest scores; softmax over just those gives the weights | Θ(T · E · k) |
| capacity | each expert gets C = ⌈CF · k · T / E⌉ slots | Θ(1) |
| dispatch | fill the experts, first choices before second choices; a full expert drops the rest | Θ(T · k) |
| load balance | E · Σ f_i · P_i, where f_i is expert i's share of the assignments and P_i its mean probability | Θ(T · E) |

Here T is the number of tokens, d the width of a token's vector (4 here), E the number of experts (4), k the experts per token and CF the capacity factor. [Show me](#play:cat-sat)

## How it works

Start with [Top-2 routing with a little room to spare](#example:cat-sat): the cat sat on the mat, k = 2, capacity factor 1.25. The router multiplies each token's four numbers by W_r. For "the" that gives (0.2, 0.5, 0, 2): it likes E4 best and E2 second. Softmax over just those two scores, 2 and 0.5, gives weights 0.82 and 0.18. So "the" goes mostly to E4 and a little to E2, and its output is x plus 0.82 times E4's output plus 0.18 times E2's.

Each expert has ⌈1.25 × 2 × 6 / 4⌉ = 4 slots. E2 and E4 are asked for exactly 4 each, so nothing is dropped this time.

```check
Q: Eight tokens, four experts, top-2 routing and a capacity factor of 1.25. How many slots does each expert get?
- 4
* 5
- 2
- 10
= 1.25 × 2 × 8 / 4 = 5. The 16 assignments need 4 slots per expert on average; the factor adds a quarter more room.
```

## Capacity and dropped tokens

GShard and Switch Transformer run their experts in fixed-size batches, so every expert gets the same number of slots, decided before anyone knows where the tokens will go. With a capacity factor of 1 there is room for exactly an even split.

In [Top-1 routing drops a token](#example:top-one-drop) each expert has ⌈6 / 4⌉ = 2 slots. Three small words want E4: the, on and the second the. The second the is third in line, so it is dropped. A dropped token isn't lost; the residual add passes it on unchanged, and the next layer gets another chance. But this layer did nothing for it.

[One busy expert](#example:small-words) is worse. Eight tokens, five of them small words (three thes and two ands), and E4 is asked for five first choices. The third the misses out on E4, its second choice E2 is full too, and it gets no expert at all. Two of 16 assignments are dropped.

The fix is more room. [A capacity factor of 2](#example:more-room) gives every expert 8 slots and drops nothing. The price: E1 uses 3 of its 8 slots and still computes all 8. Switch Transformer (Fedus et al. 2022) reports good results with factors of 1 and 1.25. Not every system drops tokens, though: MegaBlocks (Gale et al. 2023) lets each expert take however many tokens it is sent, and drops none.

## The load-balance loss

Capacity limits the damage; training has to fix the cause. Switch Transformer adds a small extra term to the loss: E · Σ f_i · P_i. Here f_i is the share of assignments that go to expert i and P_i is the router's mean probability for it. When both are even, 1/E each, the sum is E × E × (1/E)² = 1. When everything goes to one expert it approaches E. Minimizing it pushes the router to spread the tokens. f comes from a hard choice and has no gradient; P is smooth, so the gradient goes through P.

[The router collapses](#example:animals-only) shows why it matters. Six animals, and every one goes to E1. Two get in, four are dropped, and the loss is 2.48. A router early in training can fall into this: the favoured expert gets more tokens, learns faster and becomes even more favoured.

```check
Q: Top-2 routing. A token's two highest router logits are 2 and 0.5. What weight does its first expert get?
- 0.50
- 0.75
* 0.82
- 0.18
= Softmax over the two: e^2 / (e^2 + e^0.5) = 1 / (1 + e^−1.5) ≈ 0.82. The second expert gets 0.18.
```

## Token choice or expert choice

So far each token picks its experts. Zhou et al. (2022) turn it around: each expert picks the C tokens with the highest router probability for it. Every expert is exactly full, so the load is balanced by construction and the loss above is always 1.

In [Experts choose their tokens](#example:expert-choice) the same sentence as One busy expert routes without dropping an assignment. But look at the tokens: E1 has only three animals to choose from, so it takes "and" too. The first "and" ends up with all four experts and the last "the" with just one. Expert choice spreads the experts' work evenly, not the tokens'. With less room, in [Expert choice leaves a token out](#example:expert-choice-tight), nobody picks the last "the" at all. And an expert has to see all the tokens before it can choose, which is fine in training and awkward when a model writes one token at a time.

## When to use it

Use a mixture of experts when you want more parameters without more compute per token, and you have the memory to hold all the experts. It's a good deal for large models served at scale. It's a poor one on a small device: every expert has to be loaded even though each token uses one or two. Routing also makes training less stable and adds communication when experts live on different machines.

The balancing problem is the classic one from distributed systems. [Consistent hashing](/consistent-hashing/) spreads keys over servers with no learning at all; a router is a learned hash that is also supposed to be useful. Top-k itself is a selection problem: with many experts, a [binary heap](/binary-heap/) of size k finds the k best in one pass.

## Common mistakes

- Thinking a mixture of experts makes the model cheaper to store. It makes it cheaper to run per token. All the experts still sit in memory.
- Thinking the experts specialize in topics a person would name. Here they do, because the router is made by hand. Trained experts specialize in patterns that are much harder to read.
- Forgetting the residual. A dropped token isn't deleted; it skips this layer's experts.
- Renormalizing in the wrong place. With top-2 here, softmax is taken over the two chosen scores. Switch Transformer (top-1) multiplies by the router probability p instead, so the router still gets a gradient.
- Computing f after capacity. Switch counts where the tokens wanted to go, before any are dropped.
- Expecting expert choice to help every token. It balances experts; a token can still get none.

## At real scale

Shazeer et al. (2017) put a mixture of experts between LSTM layers and trained models with up to 137 billion parameters. Switch Transformer (2022) routes each token to one expert; its largest model, Switch-C, has 2048 experts and about 1.6 trillion parameters. Mixtral 8x7B (2024) has 8 experts per layer and routes each token to 2: 47 billion parameters, 13 billion active. DeepSeek-V3 (2024) has 671 billion parameters with 37 billion active per token, and balances its experts mainly with a bias per expert added to the router scores, rather than an extra loss. The toy here has 4 experts and 8 tokens.

## Try this

- [Top-2 routing with a little room to spare](#example:cat-sat): set the capacity factor to 1. Which assignments are dropped, and why those?
- [Top-1 routing drops a token](#example:top-one-drop): switch to top-2. Does the second the get any expert now?
- [One busy expert](#example:small-words): what is the smallest capacity factor that drops nothing?
- [The router collapses](#example:animals-only): switch to expert choice. Which experts get the animals, and what happens to the loss?
- Load "cat mat sat the". Why is the loss exactly 1?
