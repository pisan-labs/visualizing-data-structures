# word2vec (skip-gram)

"You shall know a word by the company it keeps" (Firth, 1957). word2vec turns that line into an algorithm. Slide a window over the text, and every time two words show up near each other, nudge their vectors closer. Every time two words did not show up together, nudge them apart. Do that a few billion times and words used in the same way end up pointing the same way. The [embeddings](/embeddings/) page starts from vectors like that. This page shows where they come from.

Everything here is a toy: eight words, four sentences ("the cat sat on the mat", "the dog sat on the rug", "the cat saw the dog", "the dog saw the cat") and two numbers per vector, so you can watch the vectors move. cat and dog keep exactly the same company in these sentences, and so do mat and rug. If the algorithm works, they should end up together.

## The idea

| Step | What it does | Cost |
|---|---|---|
| window | each word in the middle pairs with every word at most L away | Θ(n · L) pairs for n words |
| noise | draw k random words for each pair, common words more often | Θ(k) |
| score | σ(w · c): how much the model believes c is a real neighbour of w | Θ(k · d) |
| update | pull the real pair together, push the k noise words away | Θ(k · d) |

d is the number of dimensions (2 here). Every word has two vectors: w, the word itself (a dot), and c, the word as someone else's neighbour (a square). This is skip-gram with negative sampling, from Mikolov et al. (2013), with SLP3's notation. [Show me](#play:one-sentence)

## The window makes pairs

The window is a [sliding window](/sliding-window/): put each word in the middle in turn, and pair it with every word at most L positions away. In [A window of one word on each side](#example:window-one), "the cat sat on the mat" makes 10 pairs: (the, cat), (cat, the), (cat, sat), (sat, cat) and so on. Not 6 × 2 = 12, because the words at the ends have only one neighbour.

A wider window makes more pairs, and pairs further apart. In [A wide window pairs a word with itself](#example:wide-window), L = 3 on "the cat saw the dog" gives 18 pairs, and one of them is (the, the): the first the and the second are three apart. That is fine. w_the and c_the are different vectors.

```check
Q: With a window of 2, which words does sat pair with in "the cat sat on the mat"?
- cat and on
* the, cat, on and the
- the, cat, on, the and mat
- Every other word in the sentence
= Two on each side: the and cat before it, on and the after it. The mat is three away.
```

## One update

Here is [One update, step by step](#example:one-pair), for the pair (cat, sat). w_cat is (−0.50, 0.80) and c_sat is (−0.30, 0.00). Their dot product is 0.15, and σ(0.15) = 0.54. σ squashes any number into 0 to 1, so read it as a probability: the model is 54% sure that sat is a real neighbour of cat. It is, so we want 1.

The fix is a step of [gradient descent](/gradient-descent/) on the loss −log σ(w · c). For the real neighbour it works out to: c_sat gains η(1 − σ) of w_cat. With η = 0.1 that is 0.1 × 0.46 = 0.05 of (−0.50, 0.80), and c_sat moves from (−0.30, 0.00) to (−0.32, 0.04). Toward w_cat. The worse the guess, the bigger the step: at σ = 0.99 there is almost nothing to fix.

The noise words go the other way. They were on (σ = 0.73) and the (σ = 0.46), and for them we want 0, so each c loses ησ of w_cat. Last, w_cat itself moves by the sum of the same terms: toward c_sat, away from c_on and c_the. After the update σ(w_cat · c_sat) is 0.542, up from 0.537. A small step. Learning is thousands of them.

```check
Q: w = (1, 0) and c = (0.5, 0.5) are a real pair, η = 0.1 and σ(w · c) = 0.62. Where does c move?
* (0.538, 0.5)
- (0.562, 0.5)
- (0.462, 0.5)
- (0.5, 0.538)
= c gains η(1 − σ) = 0.1 × 0.38 = 0.038 of w = (1, 0), so c becomes (0.5 + 0.038, 0.5). It moves toward w, along w.
```

## Why the noise words

Try [No noise words: everything collapses](#example:no-negatives), with k = 0. The loss falls to 0.02 after 20 passes, which looks great. It isn't. With nothing pushing apart, the easiest way to make every σ close to 1 is to point every vector roughly the same way and make them long. At the end, every one of the 16 vectors is within 90° of every other. cat ends up as close to mat (cosine 0.88) as to dog (0.87). Perfect loss, useless vectors.

The noise words fix that. For each real pair, draw k words at random and train the model to say "not a neighbour" to them. Mikolov et al. draw them in proportion to count^0.75, not count. The 3/4 power takes the edge off common words: the is 8 of the corpus's 22 words, 36%, but it is drawn 29% of the time; mat (1 word, 5%) is drawn 6% of the time. The draw itself is the one on the [sampling](/sampling/) page: lay the probabilities end to end and see where a uniform number u lands. Here a draw that lands on the pair's own words, or on a word drawn already, is drawn again.

This is also why word2vec is fast. The honest way to ask "is sat a neighbour of cat?" is a softmax over the whole vocabulary, which costs a dot product per word: millions of them. Negative sampling asks k + 1 yes-or-no questions instead.

## Watching it learn

[One pass over the corpus](#example:one-pass) makes 64 updates. Not much happens: the cosine of w_cat and w_dog goes from −0.52 to −0.12. Words start out random, and a few dozen small steps do not undo that.

[Twenty passes: same company, same place](#example:twenty-passes) does. After 10 passes w_cat and w_dog have a cosine of 0.94; after 20 it is 1.00, and mat and rug are at 0.96. Meanwhile cat and mat, which keep different company, sit at 0.49. Nobody told the algorithm that cats and dogs are animals. It only saw who sits next to whom.

The learning rate matters as it always does. [Big steps jitter](#example:big-steps) uses η = 0.5: the clusters still form, but the average loss bounces between 1.92 and 2.07 from pass to pass instead of settling (at η = 0.1 it is down to 1.67 by pass 20), and cat and mat drift closer (0.66). Each update is tuned to one pair, and a big step for one pair undoes some of the last.

## Two vectors per word

Why does each word get two vectors? A word is rarely its own neighbour. With one vector per word, a word's score with itself is its length squared, which is never negative and grows as training makes the vectors longer, so every word would look like its own best neighbour. With two, w_cat · c_cat is free to stay small. After training, the usual choice is to keep W and throw C away; adding w and c is another (SLP3 mentions both). Look at the end of the twenty passes: the dots gathered on one side and the squares on the other, so that each word's w faces the c's of its neighbours.

## When to use it

word2vec gives you one vector per word, cheaply, from raw text and nothing else. That still makes it a good baseline for search, clustering and features for a small classifier, and it is the clearest place to see the idea behind every embedding table, including the one at the bottom of a transformer.

Its limits are the flip side. One vector per word means "bank" by the river and "bank" with the loan share a vector; a transformer's contextual vectors ([self-attention](/self-attention/)) fix that. A word it never saw gets nothing; fastText (Bojanowski et al., 2017) builds vectors from pieces of words for that reason. And it learns whatever the text says, biases included.

## Common mistakes

- Forgetting the noise words, or using too few. [Show me](#play:no-negatives)
- Drawing noise words in proportion to their counts. "the" would crowd out everything else; the 0.75 power is there for a reason.
- Reading closeness as meaning. cat and dog are close because they share neighbours. Antonyms (hot, cold) share neighbours too, so they often end up close.
- Using the same vector for a word and its context, and then wondering why every word is its own nearest neighbour.
- Expecting one pass to do much. [One pass](#example:one-pass) barely moves the cosines.
- Updating w with the new c's instead of the old ones. Each term uses the vectors from before the update.

## At real scale

The vectors Google released with the 2013 papers have 300 numbers for each of 3 million words and phrases, learned from about 100 billion words of news. This page has 2 numbers for each of 8 words, learned from 22. The paper suggests k from 5 to 20 noise words for small datasets and 2 to 5 for large ones, and the original code's default window is 5. That code also shrinks the window at random for each word, so near neighbours count more often, and skips very common words some of the time (subsampling, with a probability of 1 − √(t / f) for a word of frequency f, t about 10⁻⁵).

## Try this

- [The window slides over one sentence](#example:one-sentence): set the detail to fine and follow one pair from the draw to the move. Which vector moves most?
- In [One update, step by step](#example:one-pair), set η to 0.5. How far does c_sat move now?
- Train 10 passes, then 10 more, then press New random vectors and do it again. Do cat and dog always find each other? Do they land in the same place?
- [No noise words](#example:no-negatives): set k to 1, then 4. How few noise words does it take to stop the collapse?
- Train "the cat sat" over and over. What happens to cat and dog when only one of them gets trained?
