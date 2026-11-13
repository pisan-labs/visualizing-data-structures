# Sampling: temperature, top-k, top-p

A language model does not write words. It gives a score to every word that could come next, and something else has to choose. Always take the top word and the text is safe and dull, and it often loops. Draw at random from all of them and now and then you get nonsense from the long tail. Most systems that write text pick somewhere in between, with a few knobs: temperature, top-k, top-p, min-p. This page turns those knobs one at a time.

The model here has read "the cat sat on the" and scores eight candidate words. The scores are made up, so you can see what each step does to them.

## The idea

| Step | What it does | Cost (V words) |
|---|---|---|
| temperature | divide every logit by T | Θ(V) |
| softmax | e to each logit, minus the largest first; divide by the total | Θ(V) |
| cut | greedy keeps 1 word; top-k the k most likely; top-p the fewest, most likely first, that add up to p; min-p every word with at least a share of the top word's probability | Θ(V) to Θ(V log V) |
| renormalize | divide the survivors by their total, so they add up to 1 | Θ(V) |
| draw | a uniform u in [0, 1); lay the survivors end to end and take the one whose stretch holds u | Θ(m) for m survivors |

The scores are called logits. They can be any real number. Softmax turns them into probabilities, and the cut and the draw do the rest. [Show me](#play:nucleus)

## How it works

The start logits are mat 3.2, rug 2.4, box 1.9, tree 1.1, ball 0.6, dog 0.1, the −0.8 and ran −1.5. Softmax subtracts the largest (3.2), takes e to each (1, 0.45, 0.27 and so on), adds them up (1.99) and divides: mat 0.50, rug 0.23, box 0.14, tree 0.06, and the last four share what is left.

In [Top-p keeps the nucleus](#example:nucleus), top-p with p = 0.9 adds up from the top: mat, rug and box make 0.86, not enough, so tree joins them at 0.93. The other four drop out. Divide the four survivors by 0.93 and they add up to 1 again; mat goes from 0.50 to 0.54. Then the draw. The bars slide end to end so they tile 0 to 1, a random u = 0.849 comes up, and it lands in box's stretch, 0.786 to 0.934. So the next word is box, the third choice. Sampling is supposed to do that sometimes.

[Where u lands](#example:given-u) does the same with top-k (k = 3) and a u you pick: mat covers 0 to 0.581, rug 0.581 to 0.842, and u = 0.62 picks rug. Type your own u and press Draw with u (under More operations).

```check
Q: Top-k keeps two words, with logits 3 and 2 (T = 1). After renormalizing, what is the probability of the first?
- 0.60
* 0.73
- 0.88
- 1.00
= The dropped words cancel out: it is a softmax over the two kept logits, e³ / (e³ + e²) = e / (e + 1) = 0.73.
```

## Temperature

Divide every logit by T before the softmax. T below 1 spreads the logits apart, so the favourite pulls ahead. T above 1 squeezes them together, so the tail wakes up. In [Low temperature: nearly always the favourite](#example:cold), T = 0.5 takes mat from 0.50 to 0.77, and twenty draws give mat 18 times. In [High temperature: the tail wakes up](#example:hot), T = 2 drops mat to 0.31 and gives ran 0.03 instead of almost nothing; twenty draws give six different words.

As T goes to 0 you get greedy. As T grows, every word tends to the same probability. T = 0 itself would divide by zero, so treat it as greedy. [Greedy: the same word every time](#example:greedy-same) never needs a random number at all.

## Top-k, top-p, min-p

Top-k keeps a fixed number of words. That is fine when the model is unsure and wasteful when it is sure. In [A confident model: top-p keeps one word](#example:peaked-top-p), mat has 0.93 on its own; top-k with k = 3 would still keep rug and box at 0.03 and 0.02, but top-p with p = 0.9 keeps only mat. The opposite happens on a flat step. In [Top-k on a flat distribution](#example:flat-top-k), six words score about the same, and top-k with k = 3 keeps only 0.55 of the probability. It drops tree although tree has exactly the same logit as box. Box just came first.

Top-p (nucleus sampling, Holtzman et al. 2020) adapts: few words when the model is sure, many when it is not. Min-p (Nguyen et al. 2024) adapts another way. It keeps every word with at least a fraction of the top word's probability. In [Min-p: a floor that moves with the top word](#example:min-p), the ratio is 0.2 and mat has 0.50, so the floor is 0.10 and mat, rug and box stay.

```check
Q: Top-p with p = 0.9, and the probabilities are 0.6, 0.25, 0.1 and 0.05, largest first. How many words survive?
- 1
- 2
* 3
- 4
= Add up from the top until the total reaches 0.9: 0.6 + 0.25 = 0.85 is not enough, 0.6 + 0.25 + 0.1 = 0.95 is. The word that crosses the line stays.
```

This page divides by T first and cuts after. Then the cut sees the probabilities that temperature made, so a high T can let more words through top-p. Try [the nucleus](#example:nucleus) at T = 2.

## The algorithms underneath

Top-k is a selection problem. Sorting all V logits costs Θ(V log V), which is what this page does because V is 8. A min-heap of size k ([binary heap](/binary-heap/)) does it in Θ(V log k) in one pass, and [quickselect](/quickselect/) finds the k-th largest in Θ(V) on average. Top-p needs the survivors in order, but only until the total reaches p: build a heap in Θ(V) and pop the largest until you have enough.

The draw walks the survivors and adds up until the total passes u: Θ(m). Store the running totals (prefix sums) and a [binary search](/binary-search/) finds u's stretch in Θ(log m) instead, which pays off when you draw many times from the same distribution.

## Common mistakes

- Dividing the probabilities by T instead of the logits. Renormalizing undoes it, so nothing changes.
- Forgetting to renormalize after the cut. The survivors then add up to less than 1, and a large u falls off the end.
- Stopping top-p one word early. Keep adding until the total reaches p; the word that crosses the line is kept.
- Reading min-p's ratio as an absolute threshold. A ratio of 0.1 means a tenth of the top word's probability, not 0.1.
- Expecting top-k to notice when the model is sure. It always keeps k.
- Taking e to large logits directly. Subtract the largest first; the answer is the same and nothing overflows.
- Thinking greedy is the most likely sentence. It is the most likely next word, every time, which is not the same thing (see [beam search](/beam-search/)).

## At real scale

Real vocabularies are large: GPT-2 (2019) scores 50,257 tokens at every step, and the cut and the draw run once per token generated. Even sorting 50,257 numbers is cheap next to running the model that produced them. Holtzman et al. (2020) proposed top-p after showing that greedy and beam search make bland, repetitive text, while plain sampling drifts into the unreliable tail. Min-p is from 2024.

## Try this

- [Top-p keeps the nucleus](#example:nucleus): change p to 0.5. How many words survive now?
- Load `3 3 0 0` and use top-k with k = 1. Which word wins, and why that one?
- [High temperature: the tail wakes up](#example:hot): switch to top-p. Can ran still be drawn?
- Use min-p on the start logits at T = 0.5 and at T = 2. Why does the floor keep more words when it is hot?
- [Where u lands](#example:given-u): which u would pick box?
