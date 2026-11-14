# Speculative decoding

A large language model writes one word per pass, and each pass reads every weight of the model from memory. For a big model that read is the slow part, not the arithmetic. So a pass that scores five positions costs about as much as a pass that scores one. Speculative decoding cashes in on that. A small, fast model guesses the next few words. The large model checks all the guesses in one pass, keeps the ones it agrees with, and fixes the first one it does not.

The surprise is that nothing is lost. With the right acceptance rule the text has exactly the large model's distribution, as if the small model had never been there. Leviathan, Kalman and Matias published it in 2023, and Chen and colleagues at DeepMind published the same idea, as speculative sampling, the same year.

Here the small model is the bigram and the large one the trigram from the [n-gram page](/ngram-lm/), both counted from the toy corpus. Real draft models are neural networks too, just smaller, but the algorithm only needs a q and a p.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `draft` | the small model proposes up to k words, drawing each from q | k small passes |
| `verify` | one large pass gives p at every draft position at once | 1 large pass |
| test draft i | accept when u < p(x)/q(x), so with chance min(1, p/q) | Θ(1) |
| on a rejection | draw from norm(max(0, p − q)) instead, and stop | Θ(V) |
| all accepted | draw a bonus word from p after the last draft | Θ(V) |

Each round adds the drafts accepted plus one word from the large model, for one large pass. Plain decoding needs one large pass per word, so a round that accepts n drafts saves n passes. [Show me](#play:generate)

## One round

[One round, step by step](#example:one-round) starts from "the cat" with k = 3. The small model drafts three words, one small pass each: saw (q = 0.10), the (0.67) and rug (0.03). Then one pass of the large model scores all three positions.

- saw: p = 0.11, so p/q = 1.11. The large model likes it at least as much as the small one, so it is accepted whatever u is.
- the: p = 1, p/q = 1.50. Accepted.
- rug: after "saw the", the trigram has only ever seen cat and dog, so p(rug) = 0. Rejected.

In place of rug, the large model draws from what it wanted more than the small model gave: max(0, p − q), scaled to add up to 1. That is dog 0.54 and cat 0.46, and u = 0.140 picks dog. The round adds saw the dog: three words for one large pass. [Show me](#play:one-round)

```check
Q: The small model drafts x with q(x) = 0.5. The large model gives p(x) = 0.2. What is the chance x is accepted?
- 0.2
* 0.4
- 0.5
- 1
= min(1, p/q) = 0.2 / 0.5 = 0.4. The small model is too keen on x; accepting it 40% of the time trims its share to what the large model gives it.
```

## Why the text is the large model's

Take one position, with small model q and large model p. A word w comes out in one of two ways. Either the draft was w and was accepted: q(w) · min(1, p(w)/q(w)) = min(q(w), p(w)). Or some draft was rejected and the leftover drew w. The leftover holds exactly what min(q, p) left over from p, so the two add up to p(w). Words the small model overrates are cut back by the test; words it underrates are topped up by the leftover. The tests behind this page check it for several prompts, to 12 decimals.

That is why u has to be compared with p/q, and why the resample must come from max(0, p − q) and not from p. Draw from p instead and the words the small model already proposed get counted twice.

[A rejection and a resample](#example:rejection) shows the leftover doing its job. The small model drafts rug after "the" (q = 0.03), which the trigram never saw there. The leftover is dog 0.36, cat 0.23, bird 0.20 and fox 0.20: the four words the large model likes more than the small one does. [Your own u values](#example:given-u) lets you set the u's: after "the cat" the small model drafts the end of the text, </s>, with q = 0.30, the large model gives it p = 0.22, and u = 0.8 rejects it (p/q = 0.74). Type other u values and press Verify with u (under More operations).

## Counting the passes saved

[Generate from the](#example:generate) writes "the dog saw the cat sat on the mat </s>": 9 words in 4 large passes, so 5 saved. The rounds added 2, 2, 4 and 1 words; the third accepted all three drafts and got a fourth word free, because the pass already had p after the last draft. The small model ran 10 times and 6 of its drafts were accepted.

```check
Q: With k = 4, the large model accepts the first 2 drafts and rejects the third. How many words does the round add?
- 2
* 3
- 4
- 5
= The 2 accepted drafts, then 1 word drawn from the leftover in place of the third. The fourth draft is thrown away unchecked. 3 words for 1 large pass: 2 passes saved.
```

Leviathan et al. work out the average. If each draft is accepted with chance α, a round adds (1 − α^(k+1)) / (1 − α) words. With α = 0.6 and k = 3 that is 2.18 words per pass; the generate example got 9/4 = 2.25. More drafts help less and less, and each rejected draft was a small pass for nothing. [One draft at a time](#example:one-draft) writes the same sentence with k = 1 and needs 6 large passes.

## Greedy acceptance

With greedy decoding the rule is simpler: the small model proposes its top word, a draft is accepted when it is also the large model's top word, and the large model's top word replaces the first one that is not. The text is then exactly the large model's greedy text. In [Every draft accepted](#example:all-accepted), from "the fox" the two models agree on is running </s>: 3 words in 1 pass. In [Greedy: the draft guesses wrong](#example:greedy), from "a", the bigram keeps guessing words that follow a word in general, while the trigram knows the sentence: a bird saw a cat </s> takes 4 passes for 5 words. [Nothing saved](#example:bad-draft) is the worst case: from "a bird" the first three rounds keep none of their drafts and the last keeps only the end of the text, so 4 words take 4 large passes, and 9 of the 10 small passes were wasted.

## When to use it

Use it when a large model is slow because it is memory-bound, which is most single-request decoding, and when a much smaller model that agrees with it often is available: a smaller model of the same family, trained on the same data. The output does not change, so it needs no new evaluation.

Avoid it when the draft model disagrees too often (the [Nothing saved](#example:bad-draft) case, with extra cost), when the large model is busy with big batches and is limited by arithmetic rather than memory, or when you cannot afford to keep a second model in memory.

## Common mistakes

- Accepting when u < q/p. The ratio is target over draft, p/q.
- Resampling from p after a rejection. The leftover is norm(max(0, p − q)); drawing from p overweights the words the draft already proposed.
- Keeping the drafts after a rejected one. They were made from a word that is no longer there.
- Forgetting the bonus word. When every draft is accepted, the pass has already scored the next position.
- Counting a round as one word. It adds the drafts accepted plus one, for one large pass.
- Thinking the small model changes the text. With this rule, it changes only how fast the text comes.
- Thinking more drafts are always better. The chance that all k survive falls like α^k, while every draft costs a small pass.

## At real scale

Leviathan et al. (2023) report a 2 to 3 times speedup for T5-XXL with identical outputs. Chen et al. (2023) report 2 to 2.5 times for Chinchilla, a 70-billion-parameter model, with a much smaller draft model. Both use the acceptance rule on this page. The toy here pits a bigram against a trigram over 30 tokens; the real ones have tens of thousands of tokens and billions of parameters, and the large model's pass is where nearly all the time goes. The [KV cache](/kv-cache/) is what keeps that one pass over k positions cheap, and the draws themselves are the ones on the [sampling page](/sampling/).

## Try this

- [Generate from the](#example:generate): set k to 5 and generate again. Do you save more passes?
- [One round, step by step](#example:one-round): switch to greedy acceptance. Which drafts survive now?
- [Your own u values](#example:given-u): which u values accept the draft </s>?
- [Nothing saved](#example:bad-draft): switch to sampling and generate a few times. Is it ever worse than 4 passes for 4 words?
- Start from "the dog chased" with greedy acceptance. Why does the first round keep every draft?
