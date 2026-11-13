# The transformer block

A transformer is the same block stacked again and again: 12 times in GPT-2 small, 32 in Llama 7B. Each block does two things to every word's vector. Attention lets the word gather from the words before it. A feed-forward network then works on each word on its own. Around both sit a normalization and a residual add. After the last block, the unembedding turns the last word's vector into a score for every word in the vocabulary, and the highest score is the guess for the next word.

This page has one block and a toy vocabulary of 21 words. **Every weight is made by hand.** Nothing was trained, so each number can be read: you can see which rule fired and why. A real model learns its weights from billions of words, and nobody can read them this easily.

## The idea

| Step | What it does | Cost |
|---|---|---|
| normalize | rescale each vector to a standard size (LayerNorm or RMSNorm) | Θ(n · d) |
| attention | each word gathers from the words before it, then W_O maps that back to width d | Θ(n² · d_k + n · d · d_k) |
| residual add | x₁ = x + attention: add, never replace | Θ(n · d) |
| feed-forward | a small network on each word: widen to d_ff, a nonlinearity, narrow back | Θ(n · d · d_ff) |
| residual add | x₂ = x₁ + FFN | Θ(n · d) |
| unembedding | score every word in the vocabulary: logits = h · U, then softmax | Θ(V · d) for the last word |

Here n is the number of words, d the width of the vector (8 here), d_k the width of the attention head (2), d_ff the hidden width of the feed-forward network (4) and V the size of the vocabulary (21). [Show me](#play:article-after-animal)

## How it works

Each word's vector has 8 numbers. The first four are its embedding from the [embeddings](/embeddings/) page: how much it is an animal, a thing, an action and a small word (the, a, on). The last four start at 0. That empty half is where the block writes its guess about the next word, in the same four features.

Start with [An article after an animal](#example:article-after-animal): the cat sat on the. We follow the last word, the second "the", because its output is the guess for what comes next.

LayerNorm first. The eight numbers of "the" are one 1 and seven 0s. Their mean is 0.13 and their standard deviation 0.33, so the 1 becomes 2.65 and every 0 becomes −0.38. Then attention, done by the same code as the [self-attention](/self-attention/) page. This head is simple: a small word looks back for nouns. The query of "the" is (3.78, 3.78), the key of cat is (3.05, 0.31), and the score is 8.97. Nothing else comes close, so "the" puts all its weight on cat. It comes back with z = (2.63, −0.11): it found an animal. W_O turns that into a vote, −2.75 for "the next word is an animal" and +2.75 for "the next word is a thing". An animal already came before, so the next noun is probably the object.

The feed-forward network has four hidden units, one rule each: an animal is followed by an action, a thing and an action by a small word, a small word by a noun. For "the", unit 4 fires and adds a little to animal (0.45) and thing (0.23). Attention's vote is bigger, so thing wins. The unembedding gives mat 2.04, box 2.02 and rug 1.82, and softmax turns those into 0.18, 0.18 and 0.15. The guess is mat.

Compare [The first word](#example:first-word). The same "the", with nothing before it. Attention finds no noun, its two votes cancel, and the FFN's rule wins: cat (0.20).

## The residual stream

Look at the first four columns of the stream rows, x, x₁ and x₂. They don't change. Attention and the FFN write only into the next-word half, and the residual add puts their output next to what was there. Nothing is replaced.

This is the idea that makes deep transformers work (He et al. used it for image networks in 2016). Each block reads the stream, adds a small edit, and passes it on. Information a later block needs is still there. And when the model learns, the gradient has a straight road back through every add: a value used twice gets both gradients, as on the [backpropagation](/backpropagation/) page.

```check
Q: In a pre-norm block, a word's stream is x = (1, 0, 0, 0, 0, 0, 0, 0) and attention returns (0, 0, 0, 0, −1, 1, 0, 0). What is x₁?
- (0, 0, 0, 0, −1, 1, 0, 0)
* (1, 0, 0, 0, −1, 1, 0, 0)
- (1, 0, 0, 0, 0, 0, 0, 0)
- (0.5, 0, 0, 0, −0.5, 0.5, 0, 0)
= x₁ = x + attention, number by number. The word's own 1 stays; attention's output lands next to it.
```

## Pre-norm or post-norm

The original paper (Vaswani et al. 2017) puts the norm after each add: x₁ = LN(x + Attention(x)). That's post-norm. GPT-2 (2019) moved it to the start of each branch, x₁ = x + Attention(LN(x)), and added one final norm after the last block. That's pre-norm, and most models since use it.

Switch [Post-norm, as in the original paper](#example:post-norm) and watch the first four columns. In post-norm the stream itself is normalized after every add, so the 1 of "the" becomes 2.14 and then 1.74. In pre-norm the stream is only ever added to, and the norms sit on the branches. Deep post-norm models are harder to train; they need a careful learning-rate warm-up (Xiong et al. 2020 study why). The guess is mat either way here, with 0.15 instead of 0.18.

## LayerNorm or RMSNorm

LayerNorm (Ba, Kiros and Hinton 2016) subtracts the mean and divides by the standard deviation, then scales by γ and shifts by β. RMSNorm (Zhang and Sennrich 2019) skips the mean: it divides by the root mean square and scales by γ. It's cheaper and has half the parameters, and Llama uses it. Here γ = 1 and β = 0, and a tiny ε = 0.00001 keeps an all-zero vector from dividing by zero.

```check
Q: What is LayerNorm of (3, 4), with γ = 1, β = 0 and ε ignored?
- (0.6, 0.8)
* (−1, 1)
- (0.85, 1.13)
- (3.5, 3.5)
= The mean is 3.5 and the standard deviation 0.5: (3 − 3.5) / 0.5 = −1 and (4 − 3.5) / 0.5 = 1. RMSNorm would give (0.85, 1.13).
```

In [RMSNorm and SwiGLU, as in Llama](#example:llama-style), "the" normalizes to 2.83 with the zeros left at 0. Try both on the same sentence and compare the LN rows.

## The feed-forward network

Attention moves information between words. The feed-forward network is where each word thinks on its own: widen to d_ff numbers, apply a nonlinearity, narrow back. Without the nonlinearity two matrices would collapse into one, and the block could only compute weighted sums.

- **ReLU** (the original paper): negatives become 0.
- **GELU** (Hendrycks and Gimpel 2016; GPT-2): a smooth ReLU, x · Φ(x). Small negatives come out a little below 0: −0.38 becomes −0.13. This page uses the tanh formula GPT-2 uses.
- **SwiGLU** (Shazeer 2020; Llama): SiLU(x·W_g) times x·W_u, then W_d. A gate decides how much of each unit gets through. It needs three matrices instead of two, so Shazeer shrinks d_ff by a third to keep the parameter count the same, and Llama uses 2/3 of 4d.

Here d_ff = 4, one unit per rule. Real models make it much wider than the stream: GPT-2 small uses 3072 for a width of 768.

## From the vector to the next word

The unembedding U has a column for each of the 21 words. A word's score is its embedding dotted with the next-word half (how well it fits the guess), plus two direct links from the word itself: "on" scores after an action and "and" after a thing. Those two links are bigram rules, the kind of thing the [n-gram model](/ngram-lm/) counts. Without them the toy could never say "on": its embedding is almost the same as "the".

Then softmax turns the scores into probabilities, and the guess is the most likely word. In [After an action, on](#example:action-then-on), on gets 0.38. A real model would [sample](/sampling/) from these probabilities instead of always taking the top one. Ties go to the word that comes first in the vocabulary: in the Llama example mat and box score exactly the same.

## Counting parameters

The readout counts the block's parameters for the current setting:

- each norm: 2d = 16 for LayerNorm (γ and β), d = 8 for RMSNorm;
- attention: W_Q, W_K and W_V (8 × 2 each) and W_O (2 × 8): 64;
- FFN with ReLU or GELU: W₁ (8 × 4), b₁, W₂ (4 × 8), b₂: 76; SwiGLU: three 8 × 4 matrices and no biases: 96.

The default (LayerNorm, GELU) has 2 × 16 + 64 + 76 = 172. A pre-norm model also has its final norm. Real blocks add up the same way, and the FFN is usually the biggest part.

## When to use it

Use the transformer block when any word may need any earlier word, at any distance, and you have the data to learn the weights. Training runs on the whole sentence at once, a big part of why it replaced recurrent networks. For short contexts and little data, an n-gram model is cheaper and does surprisingly well. The cost is attention's n² table: long contexts are expensive, which is what the [KV cache](/kv-cache/) and FlashAttention are about.

The block also has no idea of order on its own. Attention treats the words before a word as a bag; the causal mask is the only thing here that knows positions. Real models add a [positional encoding](/positional-encoding/) before the first block or rotate the queries and keys (RoPE). Real attention also has several heads, as on the [multi-head attention](/multi-head-attention/) page.

## Common mistakes

- Thinking a sublayer replaces the vector. It adds to it. x₁ = x + f(x), and the x is the point.
- Forgetting the final norm in a pre-norm model. The stream grows with every add; without the final norm the logits get whatever size the stream has.
- Mixing up the two orders. Post-norm normalizes the sum; pre-norm normalizes the input to each branch.
- Thinking RMSNorm centres the vector. It only rescales: a 0 stays 0.
- Forgetting the biases (or counting them for SwiGLU). ReLU and GELU blocks in the original paper and GPT-2 have them; the SwiGLU FFN here, as in Shazeer's paper, has none.
- Reading the toy's rules into a real model. Trained weights don't come with labels like "a small word looks back for nouns". Some heads and units can be explained; most can't yet.

## At real scale

Vaswani et al. (2017): d_model = 512, d_ff = 2048, 8 heads, post-norm, ReLU, 6 layers in the encoder and 6 in the decoder. GPT-2 small (2019): 12 pre-norm blocks of width 768, d_ff = 3072, GELU and a vocabulary of 50 257 tokens. One of its blocks has 7 087 872 parameters, 4 722 432 of them in the FFN (two thirds). With 38.6 million in the token embedding, which it reuses as the unembedding, it has about 124 million in all. Llama 7B (2023): 32 blocks of width 4096, RMSNorm, SwiGLU with d_ff = 11 008, and RoPE. The toy here has 172 parameters per block. Same shape, smaller numbers.

## Try this

- [An article after an animal](#example:article-after-animal): load "the dog saw the". What does attention find, and what does the block guess?
- [The first word](#example:first-word): why do the two votes from attention cancel?
- [After an animal, an action](#example:animal-then-action): the actions are nearly tied. Which number decides between sat and ate?
- [After a thing, and](#example:thing-then-and): switch to post-norm and RMSNorm. Does the guess change?
- Switch the FFN from GELU to SwiGLU and back. Watch the parameter count and the hidden rows.
- Load "the cat sat on". The toy guesses a noun instead of "the". Why can't it tell "on" from "the"?
