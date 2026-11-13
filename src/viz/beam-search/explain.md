# Beam search

Greedy decoding takes the likeliest next word, then the likeliest after that, and so on. It is fast, and it is short-sighted: a word that looks best now can lead somewhere poor. Trying every sentence would fix that, but with V words and T steps there are Vᵀ of them. Beam search sits in between. Grow the sentences one word at a time, as a tree, and at every step keep only the best B. B = 1 is greedy.

The model on this page is a table made by hand: the probability of each word given the word before it. A real model looks at the whole prefix, but beam search does not care where the numbers come from. The table is built to trap greedy.

## The idea

| Step | What it does | Cost |
|---|---|---|
| extend | every hypothesis in the beam, by every word that can follow: score + ln P(word) | Θ(B · V) |
| rank | sort the candidates by score | Θ(B · V · log B) with a heap |
| keep | the best B; one that ends with `</s>` is set aside as finished | Θ(B) |
| finish | the best finished hypothesis, by score or by score per word | Θ(B) |

A hypothesis's score is the log of its probability: the sum of ln P over its words, starting at 0. Logs keep the numbers from underflowing, and adding is cheaper than multiplying. Every score is at most 0, and no word can raise it. [Show me](#play:greedy-misses)

## How it works

Start with [Greedy misses the most likely sentence](#example:greedy-misses). From `<s>` the model says the 0.55, a 0.45. Greedy takes "the", then "cat" (0.40), "sat" (0.50) and `</s>` (0.70). That is "the cat sat", probability 0.55 × 0.40 × 0.50 × 0.70 = 0.077, score −2.56.

Beam search with B = 2 keeps "a" as well. One step later that pays off: after "a" the model is sure of "dog" (0.85), so "a dog" scores ln 0.45 + ln 0.85 = −0.96 and beats "the cat" at −1.51. The other three candidates drop out. At step 3, "a dog `</s>`" (−2.01) finishes. It leaves the beam, which narrows to one, and "a dog ran" carries on to "a dog ran away `</s>`" (−2.27). The best finished hypothesis is "a dog", probability 0.13: nearly twice greedy's. No sentence the model can make scores better.

```check
Q: "a dog" scores −0.96, and the model gives P(ran | dog) = 0.45. What does "a dog ran" score?
- −0.43
- −1.41
* −1.76
- −0.51
= Add the log, don't multiply: −0.96 + ln 0.45 = −0.96 − 0.80 = −1.76.
```

This is [BFS](/bfs/) with a budget. BFS explores the tree one layer at a time and keeps everything; beam search explores one layer at a time and keeps the best B. Picking the best B out of B · V candidates is a job for a [binary heap](/binary-heap/) of size B. A wider beam ([A wider beam: B = 3](#example:wide-beam)) ranks 9 candidates at step 3 instead of 6, and finishes three hypotheses instead of two.

## Length normalization

Every word adds a log-probability of at most 0, so a longer hypothesis never scores higher. Raw scores favour stopping early. In [Stopping at once scores best](#example:after-dog), starting after "dog", the winner is `</s>`, ending right there (0.35), over "ran away" (0.45 × 0.60 = 0.27).

SLP3 divides each finished hypothesis's score by its length before comparing. In [Length normalization picks the longer sentence](#example:length-norm), "a dog `</s>`" is −2.01 / 3 = −0.67 per word and "a dog ran away `</s>`" is −2.27 / 5 = −0.45, so the longer one wins. Whether that is better depends on what you want. In translation, outputs that stop too early are a real problem.

```check
Q: Why do raw log-probability scores favour short outputs?
* Each extra word adds a log-probability of at most 0, so the score can never go up as a hypothesis grows
- Beam search drops long hypotheses first
- The model gives </s> a high probability
- Logs of small numbers are positive
= Probabilities are at most 1, so every ln P is at most 0. A hypothesis that stops early has fewer of them to add.
```

## When a hypothesis ends

Implementations differ here. In SLP3, a hypothesis that ends with `</s>` leaves the beam and the beam narrows by one, until it is empty. Another common rule keeps the beam full: set the finished one aside, refill with the next best hypothesis still going, and stop as soon as B have finished. [Keep the beam full: a different answer](#example:refill) runs that rule with length normalization. It finishes "a dog" and then "the cat sat", stops, and picks "the cat sat" (−0.64 per word). The SLP3 rule found "a dog ran away" (−0.45 per word). Same model, same B, different answer.

Every search also needs a length limit. A hypothesis still going when it hits the limit is cut and counts as finished. In [A length limit cuts the search](#example:short-limit) the limit is 3, and the unfinished "a dog ran" wins: it never had to pay for `</s>`.

## When to use it

Beam search is the right tool when there is one right answer and you want the likeliest: translation, speech recognition, summaries, code completion. It is usually the wrong tool for open-ended writing, where the likeliest text is bland and repetitive. For that, sample instead ([temperature, top-k, top-p](/sampling/)).

It finds a likely sentence, not the likeliest. Turn each ln P into a cost, −ln P ≥ 0, and the best sentence is a shortest path from the root to an end. [Dijkstra](/dijkstra/) would find it exactly, but its frontier can grow without limit. Beam search caps the frontier at B and gives up the guarantee.

## Common mistakes

- Multiplying probabilities instead of adding logs. Long sentences underflow to 0.
- Comparing hypotheses of different lengths by raw score and wondering why the output is so short.
- Keeping B per parent instead of B in all. Each step keeps B hypotheses in total, from all B · V candidates.
- Extending a finished hypothesis. After `</s>`, it is done.
- Forgetting the length limit. Some models never put `</s>` near the top, and the search runs forever.
- Expecting a wider beam to always do better. It finds higher-scoring sentences, which is not the same as better ones.

## At real scale

Vaswani et al. (2017) translated with the transformer using a beam of 4 and a length penalty. Sutskever, Vinyals and Le (2014) found that in their translation model a beam of 2 already gave most of the benefit. Koehn and Knowles (2017) found that past a point a wider beam made translations worse. Holtzman et al. (2020) showed that beam search on open-ended text produces dull, repetitive output, one reason open-ended generation usually samples. Each step runs the model on all B hypotheses, which costs far more than the bookkeeping on this page.

## Try this

- [Greedy misses the most likely sentence](#example:greedy-misses): set B = 1 and run Beam search. Do you get greedy's answer?
- Start after "the" with B = 2. Does the beam ever hold a hypothesis with "fox"?
- [Length normalization picks the longer sentence](#example:length-norm): set the longest output to 4. What wins now, and why?
- [Stopping at once scores best](#example:after-dog): turn on length normalization. Which ending wins?
- Find a start word where B = 1, 2 and 3 all give the same answer.
