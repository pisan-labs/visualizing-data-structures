# Unigram tokenizer

[BPE](/bpe-tokenizer/) and [WordPiece](/wordpiece/) start from letters and glue them together. The unigram tokenizer goes the other way. It starts with far too many pieces and throws the useless ones away. Every piece gets a probability, and a word can usually be cut in many ways, so the tokenizer has a real choice to make: which cut is most probable? That is a dynamic programming problem, the same shape as [edit distance](/dp-edit-distance/).

Taku Kudo published it in 2018, together with the trick of sampling a cut instead of always taking the best one (subword regularization). SentencePiece, the library he wrote with John Richardson, has it as one of its two subword algorithms, next to BPE. This page follows Kudo's paper, with one simplification, flagged below.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `load(text)` | the seed vocabulary: every letter, plus the most frequent longer substrings; p(x) = count(x) / total | Θ(Σ n²) substrings |
| `encode(w)` | the lattice of every piece inside w, then Viterbi: the best split | Θ(n · m) |
| `encode(w)`, sampling | the forward sums, then draw a split from the end | Θ(n · m) |
| `prune()` | price every piece, remove the cheapest fifth | Θ(P · U · n · m) |
| `train()` | from the seed, prune until the target size | a few rounds of prune |

n is the length of the word, m the longest piece, P the pieces to price and U the words that use one. The model is called unigram because the pieces are independent: the probability of a split is the product of its pieces' probabilities, P(t alked) = p(t) · p(alked). [Show me](#play:lattice)

## The best split is a path

Take [The lattice of talked](#example:lattice). The vocabulary is the toy corpus's 21 letters plus its 16 most frequent longer substrings (the, th, he, at, cat, ...). Eleven of them occur inside talked: the six letters, al, alk, lk, ed and alked. Draw each one as a box under the letters it covers. A split of talked is a path through those boxes from the first letter to the last, each box starting where the last one ended. There are 9 such paths.

Multiplying small probabilities gets tiny fast, so everything is in logs and products become sums. Viterbi fills best[j], the highest log-probability of any split of the first j letters, from left to right:

- best[1] = log p(t) = −2.25.
- best[3] for tal: either t + al (−2.25 − 4.30 = −6.55) or ta + l (−4.86 − 4.04 = −8.90). Keep −6.55.
- best[6] for talked: three pieces end at the d. Through alked it is −2.25 − 4.86 = −7.11; through ed, −11.15; through d, −12.36. Keep −7.11.

Then walk back: best[6] came through alked, which starts after the t. The split is t alked, log-probability −7.11. Every position looks only at the pieces that end there and the best[] values already filled, so nothing is computed twice. Flip the signs and it is a shortest path in a DAG whose vertices are the positions, in topological order ([DAG shortest paths](/dag-shortest-paths/)).

```check
Q: best[3] = −6.55 and best[4] = −6.70. The pieces ending at position 5 are e (log p −2.50) from position 4, and nothing else. What is best[5]?
- −2.50
- −6.70
* −9.20
- −15.75
= Only one piece ends there, so best[5] = best[4] + log p(e) = −6.70 − 2.50 = −9.20 (the page shows −9.21: the inputs are rounded).
```

Fewer, longer pieces usually win, since each extra piece multiplies in another probability below 1. But not always. [Only letters: one path](#example:one-letter) encodes fox as f o x because no longer piece fits. And a letter the text never had, like the z of zebra in [A letter never seen becomes [UNK]](#example:unknown-letter), becomes [UNK] with a log-probability 10 below the rarest piece (−16.24 here), so it is used only where nothing else covers the letter.

## Where the probabilities come from

Here a piece's probability is how often it occurs in the text, over the total. The toy corpus has 99 words; counting every occurrence of every piece in the seed gives 514. the occurs 29 times, so p(the) = 29/514 and log p = −2.87. Substrings overlap, so th and he also count 29 each.

Kudo does better. After each pruning round he re-estimates the probabilities with EM, which counts every piece in every split of every word, weighted by how likely that split is. This page keeps the plain counts instead, so every number on screen can be checked with a calculator. The algorithms are the same; the numbers would differ a little.

## Training: prune what the text misses least

Start big. The seed has every letter and the most frequent substrings. Then ask, for each piece of two or more letters: if it were gone, how much less likely would the whole text be? That is its loss:

loss(x) = L(V − x) − L(V), where L = −Σ count(w) · best(w)

To compute it, split again only the words whose best split uses x. In [One pruning round](#example:one-round), on low ×5, lowest ×2, newer ×6, wider ×3 and new ×2, newer is the most expensive piece: without it, newer ×6 becomes new er, and the text loses 15.69. Eight pieces (ewe, ewer, newe, ow, lo, ew, ne, we) cost nothing at all, because no best split uses them. Kudo keeps the best 80% each round; here that means removing 3 of the 12. On a tie, the rarer piece goes first: ewe, ewer and newe. Letters are never removed, so every word keeps a split. [Show me](#play:one-round)

```check
Q: Without the piece newer, the word newer (it occurs 6 times) goes from one piece, log p −3.31, to new er, −3.02 − 2.90. What is the loss?
- 2.61
- 3.31
* 15.69
- 31.38
= One occurrence loses (−3.31) − (−5.92) = 2.61 in log-probability, and the word occurs 6 times: 6 × 2.61 = 15.69 (from unrounded numbers).
```

Then share the probability out again over what is left, and repeat until the vocabulary is small enough. [Train on the toy corpus](#example:train-corpus) goes from 16 longer pieces to 8 in three rounds. Round 1 removes lk, og, do and ca, which cost nothing; round 2 removes he, th and ed; round 3 only al. What stays is the, at, cat, dog, sa, alk, an and alked. After training, talked is t alked with −6.65 (higher than before, since fewer pieces share the probability), and walking is w alk i n g.

[Words it never saw](#example:new-words) trains the suffix text down to er, new, low and newer, then encodes lower as low er and newest as new e s t.

## Sampling a split

Viterbi always gives the same answer. Kudo's subword regularization trains a translation model on random splits instead, drawn by how likely each one is, so the model sees sa t most of the time but also s at and now and then s a t. It makes the model less fragile to how a word happens to be cut.

Drawing a split needs the total over all splits, and that is Viterbi with the max replaced by a sum: A[j] adds up every way to reach position j (the forward algorithm). Then walk back from the end, at each position drawing one of the pieces that end there with the share of A[j] it carries. In [Sampling a split](#example:sampled), sat has three splits. At the t, the choice is at (0.34) or t (0.66); after t, it is sa (0.88) or a (0.12). So sa t comes up 0.66 × 0.88 = 58% of the time, s at 34% and s a t 8%. Four draws gave s at, sa t, sa t and s at. [Show me](#play:sampled)

The setting α raises every probability to a power first. α = 1 follows the model; a smaller α flattens it. In [A smaller α: stranger splits](#example:flatter), with α = 0.2, talked ends in alked only 36% of the time instead of 98%, and the draws give t alked, t alk e d and t a lk ed.

## Unigram, BPE and WordPiece

All three end with a vocabulary of pieces. BPE keeps a list of merges and replays them in order. WordPiece keeps only the vocabulary and takes the longest piece at each place. The unigram tokenizer keeps a probability for each piece and looks at every split. That costs a little more, but it is the only one of the three that can say how likely a split is, and the only one whose random splits follow a model of how likely they are. (BPE-dropout, Provilkov et al. 2020, gets random splits out of BPE too, by skipping merges at random.) Press Compare, choose BPE, and train both on the same text.

## When to use it

Use it when you want a probabilistic tokenizer: scores for splits, sampling for regularization, or a vocabulary trained to explain the text rather than to compress it greedily. It is SentencePiece's default algorithm, so many models trained with that library use it.

Avoid it when encoding speed is all that matters and the model was trained with BPE: the tokenizer has to match the model, whatever is faster. And remember that the probabilities only decide the split. The model never sees them; it sees token ids.

## Common mistakes

- Multiplying probabilities instead of adding logs. Ten pieces at 0.01 each make 10⁻²⁰, and long words underflow. Add log-probabilities.
- Taking the longest piece first, as WordPiece does. Viterbi compares every path; the longest first piece can lose.
- Forgetting that pieces overlap in the counts. th, he and the each count 29 in the toy corpus.
- Removing letters while pruning. Then some words have no split at all.
- Pricing a piece by its own count. A frequent piece can be free to remove (th and he cost 0: the covers them), and a rare one expensive.
- Thinking sampling is noise added to Viterbi. It draws from the model's own distribution over splits, which the forward sums make exact.

## At real scale

Kudo's paper (2018) keeps the best 80% of the pieces each round, as here (SentencePiece keeps 75% by default), but starts from a much larger seed found with a suffix array (SentencePiece's holds up to a million substrings), and re-estimates with EM. SentencePiece (Kudo and Richardson, 2018) implements both unigram and BPE: T5 (2020) uses a SentencePiece vocabulary of 32 000 pieces, and Llama 2 (2023) uses SentencePiece's BPE with 32 000 tokens. The toy here starts from 21 letters and 16 longer pieces and keeps 8. Same idea, rather fewer substrings to argue about.

## Try this

- [The lattice of talked](#example:lattice): encode walked. Which piece does it share with talked?
- [Train on the toy corpus](#example:train-corpus): set the target to 3 and train. Which pieces survive, and why those?
- [One pruning round](#example:one-round): press Prune once twice more. When does low go?
- [Sampling a split](#example:sampled): encode sat ten more times. Do the counts look like 58%, 34% and 8%?
- Set α to 0.2 and encode sat a few times. Why does s a t come up more often now?
- Press Compare, choose WordPiece, and encode walking on both.
