# N-gram language model

A language model gives a probability to the next word. Before neural networks, the best way to do that was to count. Read a lot of text, count how often each word follows each other word, and divide. That is an n-gram model, and it is still the clearest place to see what "predict the next word" means. Chat models do the same job with a much better memory.

This page trains on a toy corpus of 18 short sentences ("the cat sat on the mat", "the dog chased the cat", and so on), so every count fits on a phone.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| count | slide a window of n tokens along every sentence; add 1 to that n-gram's count | Θ(N) for N tokens |
| P(w \| c) | C(c w) / C(c): how often w came after the context c, out of every time c came up | Θ(1) |
| next word | the probability of every word after c | Θ(V) |
| generate | draw a word, slide the context along, repeat until the end marker | Θ(L · V) for L words |
| perplexity | how surprised the model is by a sentence, on average per word | Θ(N) |

A bigram model (n = 2) predicts a word from the one word before it. A trigram model (n = 3) uses two. Each sentence gets start markers `<s>` (n − 1 of them) and one end marker `</s>`, so the first word has a context and the model can learn where sentences stop. [Show me](#play:after-the)

## How it works

Training is counting. In [Learning is counting](#example:count-bigrams) the window slides along all 18 sentences: 99 words plus 18 end markers make 117 bigrams, 67 of them different. The most common is `<s> the` (16 times), then `the cat` (9) and `the dog` (8). Those counts are the whole model. Nothing else is learned.

Then divide. The word "the" comes up 29 times as a context, followed by cat 9 times and dog 8 times, so P(cat | the) = 9/29 = 0.31 and P(dog | the) = 8/29 = 0.28. [What comes after the](#example:after-the) shows the whole row. The other 21 words of the vocabulary never followed "the", so they get 0.

```check
Q: In the corpus, sat appears 4 times: 3 times followed by on and once by in. With no smoothing, what is P(on | sat)?
- 3/117
- 1/4
* 3/4
- 1
= Divide by how often the context came up, not by the size of the corpus: C(sat on) / C(sat) = 3/4.
```

To generate, start at `<s>`, draw a word in proportion to its probability, and repeat from the new context. The draw is a uniform random number u between 0 and 1: lay the probabilities end to end, most likely first, and take the word whose stretch holds u. In [Write a sentence by drawing words](#example:generate) the first u is 0.539, which lands in "the" (it covers 0 to 0.889). Seven draws in all write "the cat ran under the ball" and then `</s>`. That sentence is not in the corpus. Every pair of words in it is.

## Perplexity

How good is a model? Give it a sentence it has not seen and measure its surprise. Multiply the probability of each token given its context, including `</s>` but not `<s>`, and take the N-th root of one over the product:

PP = P(w₁ … w_N)^(−1/N) = exp(−(1/N) Σ ln P(wᵢ | context))

For [A sentence the model has read](#example:seen-sentence), "the cat sat on the mat", the seven probabilities are 0.89, 0.31, 0.20, 0.75, 1.00, 0.07 and 1.00. Their logs add up to −5.86, and exp(5.86 / 7) = 2.31. On average the model was about as unsure as choosing among 2.31 equally likely words. Lower is better. [A new sentence from familiar pairs](#example:new-sentence), "the dog sat on the mat", scores 2.55: worse, but finite.

Work with logs. Multiplying a few hundred probabilities underflows to 0 in floating point; adding their logs never does.

## Zeros and smoothing

Now try "the cat ate the ball". The corpus has "dog ate" but never "cat ate", so P(ate | cat) = 0, the whole sentence gets probability 0, and the perplexity is infinite. [One unseen pair: probability zero](#example:zero). One missing pair sinks the sentence, however ordinary the rest is.

Smoothing takes a little probability from the n-grams the model has seen and gives it to the ones it has not. Add-one (Laplace) smoothing pretends every word followed every context once more than it did:

P(w | c) = (C(c w) + 1) / (C(c) + V)

where V = 30 here (29 words and `</s>`). In [Add-one smoothing removes the zero](#example:laplace), P(ate | cat) becomes 1/40 and the perplexity is 12.95. The price is steep. P(the | `<s>`) drops from 0.89 to 0.35, and after "cat" the 23 words that never followed it get more than half the probability between them. Add-k with a smaller k (0.1 here) steals less.

```check
Q: Without smoothing, a sentence contains one bigram that never appears in the corpus. What is its perplexity?
- Large, but finite
- 0
* Infinite
- The same as the sentence without that word
= That bigram gets probability 0, so the sentence does too. P^(−1/N) of 0 is infinite.
```

## Bigrams or trigrams?

A bigram model forgets everything but the last word. In [Bigrams forget the start of the sentence](#example:no-memory) it goes "the dog sat in the dog sat on the dog" and is still going when the page stops it at ten words. Each pair is fine. The sentence is not.

Trigrams remember two words. Nine words follow "the cat" in the corpus, seven different ones, and [Two words of context](#example:trigrams) writes "the cat slept on the rug". The catch is data. The longer the context, the fewer times each one shows up, and on a corpus this small a trigram model has seen most contexts once. Generate a few trigram sentences and about half come out word for word from the corpus (with bigrams, about one in twenty). It has stopped predicting and started quoting.

## When to use it

N-gram models are fast, tiny, easy to explain and need no GPU. They are still a good baseline, a good first model in a course, and a reasonable choice wherever the text is short and repetitive. The counts live in a [hash table](/hash-chaining/) keyed by the n-gram, or as paths in a [trie](/trie/), so a lookup is a few probes.

They cannot handle long-range structure. "The dog that chased the cats ... was tired" needs the subject from ten words back, and no n-gram model looks that far. That is what attention fixes.

## Common mistakes

- Dividing by the size of the corpus instead of the count of the context. P(w | c) is C(c w) / C(c).
- Forgetting `</s>`. Without it the model never learns to stop, and N in the perplexity is one short.
- Counting `<s>` in N. It is given, not predicted.
- Using the wrong V for add-one: it is every word that can come next, `</s>` included.
- Multiplying probabilities instead of adding logs.
- Comparing perplexities measured with different vocabularies or on different test text. The numbers only mean something side by side on the same test set.
- Assuming a longer n is always better. Without enough data it memorizes.

## At real scale

SLP3 reports a classic experiment on Wall Street Journal text: trained on 38 million words with a vocabulary of 19,979, the test-set perplexity is 962 for unigrams, 170 for bigrams and 109 for trigrams. Google's Web 1T corpus (2006) counted n-grams up to length 5 over about a trillion words of web text. Even that leaves most possible n-grams unseen: with GPT-2's vocabulary of 50,257 tokens (2019) there are about 1.3 × 10¹⁴ possible trigrams. Real n-gram models use better smoothing than add-one (interpolation and Kneser-Ney), and GPT-2 looks back up to 1,024 tokens instead of two.

## Try this

- [What comes after the](#example:after-the): switch to trigrams and type "the cat". How many words can follow now?
- Score "the dog sat on the mat" and "the mat sat on the dog". Which pair of words breaks the second one?
- Turn on add-one and score "the cat sat on the mat". Why does a sentence from the corpus get worse?
- Generate five sentences with bigrams, then five with trigrams. How many come straight out of the corpus?
- [Bigrams forget the start of the sentence](#example:no-memory): which word keeps pulling the sentence back to "the"?
