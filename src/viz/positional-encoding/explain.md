# Positional encoding

"The dog chased the cat" and "the cat chased the dog" use the same words. [Self-attention](/self-attention/) can't tell them apart: every word scores every other word by what it is, never by where it is. Its example "Attention does not know word order" shows it with no mask: the two cats in "the cat saw the cat" get exactly the same rows. A transformer has to be told where each word sits.

This page shows three ways. The original transformer adds a vector of sines and cosines to each word. RoPE turns each query and key by an angle that grows with the position. ALiBi adds nothing to the words and pushes down the scores of distant ones. In all three, a score can tell how far apart two words are.

## The idea

| Scheme | Where the position goes | Cost |
|---|---|---|
| sinusoidal (Vaswani et al. 2017) | PE(pos) added to each word's embedding, once | Θ(n · d) |
| learned (GPT-2, BERT) | a trained vector per position, added the same way | Θ(n · d) |
| RoPE (Su et al. 2021) | each pair of q and k turned by pos · θ_i, in every layer | Θ(n · d) per layer and head |
| ALiBi (Press et al. 2022) | −slope · (i − j) added to every score | Θ(n²) per head |

Here n is the number of words and d the width of a vector (8 here, so 4 pairs). The angle of pair i at position pos is pos / 10000^(2i/d). With d = 8 that is pos / 1, pos / 10, pos / 100 and pos / 1000. Pair 0 spins fast, pair 3 barely moves. [Show me](#play:table)

## Sinusoidal encodings

Vaswani et al. give each position a vector of d numbers: for each pair, the sine and the cosine of its angle. [The table of sines and cosines](#example:table) shows positions 0 to 6. Position 0 is (0, 1) in every pair. By position 6, pair 0 has turned 6 radians, almost a full circle (2π ≈ 6.28), while pair 3 sits at sin 0.01, cos 1. The fast pairs tell neighbours apart; the slow ones tell far-apart positions apart, like the hands of a clock.

The dials draw each pair as an arrow on a circle. That's all a pair of (sin, cos) is: a point on a circle at the pair's angle.

```check
Q: With d = 8 and base 10000, what is the angle of pair 1 at position 5?
- 5
* 0.5
- 0.05
- 50
= Pair 1 divides the position by 10000^(2·1/8) = 10. So 5 / 10 = 0.5 radians.
```

Why sines and cosines? Because PE(m) · PE(n) is a sum of sin·sin + cos·cos over the pairs, and each of those is the cosine of the difference of the two angles. So the dot product of two encodings depends only on m − n. In [Same distance, same score](#example:distance), every diagonal holds one number: positions 1 apart always score 3.54, 2 apart always 2.56.

It isn't a clean ruler, though. Distance 6 scores 3.78, almost as much as distance 1, because pair 0 has come nearly all the way round. With 4 pairs that happens fast. With hundreds of pairs, spread from 1 to 1/10000, it takes much longer.

The encoding is added to the word's embedding and then goes through W_Q and W_K, which mixes word and position. After that the clean "only the distance" property is gone from the scores. That's one reason for RoPE.

## RoPE: turn the queries and keys

RoPE adds nothing to the words. Inside every attention layer it turns each pair of a query by its position's angle, and each pair of a key by its own. [RoPE: four pairs, four speeds](#example:rope-turns) shows the angles. They are the same angles as above.

Turn the query by m·θ and the key by n·θ and the angle between them changes by (m − n)·θ. Their dot product depends on what the words are and on m − n, never on m or n alone. In [RoPE: only the distance counts](#example:rope-distance), "the dog saw the dog saw", saw at position 2 scores dog at 1 at 12.14, and saw at 5 scores dog at 4 at 12.14 too. Same words, same distance, same score.

Here every pair holds a copy of the self-attention page's query and key, so you can watch one match turned at four speeds. And the "same word twice" problem goes away. In [The same word twice](#example:same-word-twice), saw scores both cats 14.40 without positions; with RoPE it gives the cat just before it 13.07 and the cat two places after it 8.82.

```check
Q: With RoPE, the query of word A at position 7 and the key of word B at position 4 score 2.5. Which positions give the same two words the same score?
- A at 4, B at 7
* A at 10, B at 7
- A at 7, B at 7
- A at 14, B at 8
= The score depends only on m − n = 3, with the query 3 after the key. A at 10 and B at 7 keeps that. Swapping them makes it −3, which is a different angle.
```

## ALiBi: a penalty for distance

ALiBi skips position vectors altogether. It adds −slope · (i − j) to the score of the word at i looking back at j: nothing for itself, −1/2 for the word before, −1 for two back, and so on. Press et al. give each head its own slope; with 8 heads, 1/2, 1/4, down to 1/256. This page uses the first, 1/2.

In [ALiBi: the nearer word wins](#example:alibi-recency), "it" matches dog better than ball on content (1.41 against 0.78). But dog is 5 steps back and ball 2, so the biases are −2.5 and −1. ball ends with 0.36 of the weight and dog with 0.15. ALiBi bets that nearer words matter more. Often right, not always.

## When to use which

Sinusoidal and learned encodings are the simplest, and fine for a fixed context length. A learned table has no row for position 1025 if it was trained on 1024, and sinusoids beyond the trained length tend to work poorly in practice. RoPE is what many recent open models use (the Llama models among them): it costs a few multiplications per pair and gives scores that are relative by construction. ALiBi was designed to run on longer inputs than it was trained on, which is the "test long" of its paper's title.

## Common mistakes

- Reading PE(m) · PE(n) as attention. It is only the position part; a real score mixes it with what the words are.
- Adding RoPE to the embeddings. RoPE turns q and k inside each layer, after the projections; v is not turned.
- Turning the query and the key by the same position. Each is turned by its own; only then does the score depend on m − n.
- Expecting the fast pairs to measure long distances. Pair 0 wraps around every 6.28 positions. Long distances live in the slow pairs, so you need many of them.
- Mixing up pairing conventions. The paper pairs dimensions (0, 1), (2, 3), …; some code pairs dimension i with i + d/2. It's the same idea with the dimensions numbered differently, but weights trained one way don't work the other.
- Treating ALiBi's slope as learned. The slopes are fixed before training.

## At real scale

Vaswani et al. (2017) used d_model = 512, so 256 pairs, with angles from pos / 1 down to about pos / 10000. They also tried learned position vectors and found nearly identical results. BERT (2018) learns 512 position vectors and GPT-2 (2019) learns 1024. Llama (2023) uses RoPE with base 10000; Llama 3 (2024) raised the base to 500 000 for longer contexts. BLOOM (2022) uses ALiBi. Here we have 4 pairs and 7 words, enough to see the dials turn.

## Try this

- [The table of sines and cosines](#example:table): switch the scheme to RoPE and to ALiBi. What does each put in the first table?
- [Same distance, same score](#example:distance): which distance scores lowest? Why not the largest one?
- [RoPE: only the distance counts](#example:rope-distance): find two more cells with the same words and the same distance. Are they equal?
- [ALiBi: the nearer word wins](#example:alibi-recency): how much higher would dog's content score have to be for it to win back?
- [One word at position 0](#example:one-word): why is PE(0) · PE(0) exactly 4?
