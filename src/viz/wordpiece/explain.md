# WordPiece tokenizer

WordPiece is BERT's tokenizer. Like [BPE](/bpe-tokenizer/), it keeps common words whole and spells rare ones out in pieces. Pieces inside a word carry ## in front, so the tokenizer can put the word back together: the example in BERT's own code turns unaffable into un ##aff ##able. Schuster and Nakajima invented it in 2012 for Japanese and Korean voice search; Google's translation system used it in 2016, and BERT in 2019.

Two things set it apart from BPE. To encode a word it does not replay merges: it takes the longest piece in its vocabulary, again and again. And training picks pairs by a score, not by how often they occur.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `encode(w)` | take the longest piece that starts the word, then the longest ## piece after it, and so on; [UNK] if none fits | Θ(n) to Θ(n²) with a trie |
| `load(text)` | split every word into its first letter and ## letters | Θ(S) |
| `merge()` | score every pair of neighbours, merge the best | Θ(S) as drawn |
| `train()` | k merges, from the start | Θ(k · S) |

n is the length of the word, S the number of letters in the different words of the text, and k the number of merges. [Show me](#play:toy-corpus)

## Encoding: the longest piece first

[Train on the toy corpus](#example:toy-corpus) builds a vocabulary of 50 pieces and then encodes walking. The search for the longest piece is a walk down a [trie](/trie/): follow the word's letters from the root as far as the trie goes, and remember the last node with a ring, where a whole piece ends.

walking starts in the trie of pieces that start a word. w has a ring, but there is no wa below it, so the first piece is w. The rest is looked up in the trie of ## pieces: ##a (there is no ##al), then ##l, ##lk, ##lki, ##lkin, but no ##lking, so ##lkin. Then ##g. So walking is w ##a ##lkin ##g.

The walk can pass the last ring. In [The walk goes too far and backs off](#example:back-off), boat goes from b to bo, a node only because box hangs below it, and finds no boa. bo is not a piece, so the walk backs off to b, the last ring. [Show me](#play:back-off)

```check
Q: The vocabulary is a, u, un, ##n, ##a, ##b, ##l, ##e, ##ab and ##able. How does WordPiece split unable?
* un ##able
- u ##n ##able
- un ##ab ##l ##e
- [UNK]
= The longest piece that starts unable is un (there is no una). The longest ## piece that starts able is ##able, and that is the whole word.
```

## [UNK]: one missing piece loses the word

If no piece fits at some point, the whole word becomes [UNK], not just the letter. In [One missing piece: [UNK]](#example:unknown-word), no word of the toy corpus has a b inside it, so there is no ##b, and rabbit is lost, although b starts ball, bird and box. jump has a j, which the corpus has nowhere. A word longer than the limit is also [UNK], without a look: [A word over the length limit](#example:too-long) sets it to 6 letters, so walked is split and walking is not. BERT's limit is 100 characters.

```check
Q: With the toy corpus's vocabulary, which one piece would let rabbit be encoded?
* ##b
- b
- ##r
- rab
= r and ##a are there. The walk then needs a ##b for the third letter; ##i and ##t exist already.
```

## Training: score, not count

Training starts the way BPE does: split every word, count every pair of neighbours, merge the best pair, repeat. First letters stay as they are and the others get ##, so walked is w ##a ##l ##k ##e ##d. The difference is what "best" means:

score(a, b) = count(a b) / (count(a) · count(b))

with every count weighted by how often its word occurs. A pair scores high when its halves seldom occur apart. In [Score, not count](#example:score-vs-count), the occurs 12 times, so t ##h is the most frequent pair (14 times) and BPE would merge it first. But t and ##h occur 14 times each: 14 / (14 × 14) = .071. h ##u occurs only 4 times and scores 4 / (4 × 6) = .167, so it wins. After 5 merges hug, pug and hugs are pieces, and the is still t ##h ##e. [Show me](#play:score-vs-count)

The toy corpus says the same. The first merge is r ##u, 2 / (5 × 2) = .200, while t ##h, 29 times, scores .027. [The most common word stays in pieces](#example:common-word): after 20 merges the is still t ##h ##e, while bird, seen 3 times, is one piece.

The pieces it finds are often sensible. [Stems and ## suffixes](#example:suffixes) merges ##s ##t first (2 / (2 × 2) = .5), and after 10 merges lower encodes as low ##er and widest as wid ##est, two words that are not in the text.

Google never published how BERT's vocabulary was trained. Schuster and Nakajima chose the merge that most improves a language model of the training text; the score here is the one Hugging Face's course describes. After training, the merges are thrown away. Only the vocabulary is kept.

## The trie and BERT's loop

BERT's code does not build a trie. It looks up the rest of the word, then one letter shorter, then shorter again, until something is in the vocabulary. Turn off the trie setting to see it: in [BERT's loop: shorter and shorter](#example:loop), walking takes 16 lookups, against 10 steps down the tries. Both give the same pieces.

The trie walk is Θ(n) when pieces are short, but a walk can run far past its last ring and back off, piece after piece: Θ(n²) at worst. Fast WordPiece (Song et al., 2021) adds failure links to the trie, as [Aho-Corasick](/aho-corasick/) does, and gets linear time.

## When to use it

Use it with BERT and the models built on it, whose vocabularies are WordPiece. Encoding needs only the vocabulary, a set of strings, and the trie makes it one pass per piece. The ## marks make detokenizing easy: glue a ## piece to the one before it.

Avoid it when every input must be encoded. Without a byte fallback, one odd character turns a word into [UNK], and the model loses the whole word. Byte-level BPE never does that. And if you need to train your own vocabulary exactly as Google did, you can't: that code is not public.

## Common mistakes

- Forgetting the ##. ing and ##ing are different pieces, in different tries.
- Turning only the missing letter into [UNK]. The whole word goes.
- Training by count. That is BPE. WordPiece divides by how often each half occurs.
- Replaying the merges to encode. WordPiece keeps only the vocabulary and takes the longest piece.
- Expecting the fewest pieces. Greedy is not always shortest: with ab, a, ##bcd, ##c and ##d, abcd becomes ab ##c ##d, though a ##bcd is shorter. With only ab, a and ##bc, it even gives [UNK] for abc, although a ##bc fits.

## At real scale

BERT (2019) uses WordPiece with a vocabulary of about 30 000 pieces; the released English uncased model has 30 522, including [UNK] and the other special tokens. A word over 100 characters is [UNK]. The toy here starts from 30 pieces, 13 first letters and 17 ## letters, and learns 20 more.

## Try this

- [Train on the toy corpus](#example:toy-corpus): encode talking and running. Why is running cut into so many pieces?
- [One missing piece: [UNK]](#example:unknown-word): add a word with a b inside, such as rabbit itself, to the text, train, and encode rabbit again.
- [Stems and ## suffixes](#example:suffixes): encode lower, widest and newest.
- [Score, not count](#example:score-vs-count): set the merges to 6. When is t ##h finally merged?
- Turn off the trie and encode walking. Where do the 16 lookups go?
- Press Compare, choose BPE, and encode walking on both. Why do the pieces differ?
