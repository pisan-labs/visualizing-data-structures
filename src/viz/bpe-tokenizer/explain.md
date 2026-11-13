# Byte-pair encoding (BPE)

A language model does not read letters or words. It reads tokens, numbers from a fixed vocabulary. Whole words make a poor vocabulary: there are too many of them, and tomorrow someone types a word the model has never seen. Single letters work for any word, but then every sentence is very long. BPE sits in between. Common words become one token, rare words are spelled out in pieces, and nothing falls through the cracks.

It started as a compression trick. Philip Gage published it in 1994: find the most frequent pair of bytes, replace it with a byte that is not used, repeat. Sennrich, Haddow and Birch picked it up in 2016 for machine translation, and GPT-2 made it the default for language models. This page follows the version in Jurafsky and Martin's *Speech and Language Processing* (SLP3).

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `load(text)` | split every word into characters, with _ at the end | Θ(S) |
| `merge()` | count every pair of neighbours, merge the most frequent one | Θ(S) as drawn |
| `train()` | k merges, from the start | Θ(k · S) |
| `encode(w)` | split a new word the same way, replay the merges in order | Θ(k · n) |

S is the number of symbols in the different words of the text, n the length of the word being encoded, and k the number of merges. Training is the token learner; encoding is the token segmenter. [Show me](#play:toy-corpus)

## How training works

Start with [Train on the toy corpus](#example:toy-corpus): 18 short sentences, 99 words, 29 of them different. Each word is split into characters with _ at the end, so cat is c a t _. The vocabulary starts as the 22 symbols that occur.

Now count every pair of neighbours. A word counts as often as it occurs: the appears 29 times, so its pairs t h, h e and e _ each count 29. The most frequent pair is e _, 32 times (the ×29, ate, tree ×2). Merge it: every e followed by _ becomes the single token e_, and the vocabulary grows by one. Then count again. t h and th e_ are next, 29 each, and after three merges the is one token.

```check
Q: The training text is low ×5 and lower ×2, each word ending in _. How many times does the pair l o occur?
- 2
- 5
* 7
- 14
= Each word counts as often as it occurs, and both have l o once: 5 + 2 = 7.
```

Each merge saves one token for every place it joins a pair. The text starts at 420 tokens and is 193 after 20 merges. The merges are kept in a list, in the order learned. That list is the tokenizer.

[Shared pieces become tokens](#example:suffixes) is a smaller text: low ×5, lowest ×2, newer ×6, wider ×3, new ×2. e r occurs 9 times (newer ×6, wider ×3) and is merged first, then er _. Neither newer nor wider is special; er just occurs in both.

## Encoding: replay the merges in order

To encode a new word, split it the same way and replay the merges, in the order they were learned, each one everywhere in the word. lower is not in that text, but its pieces are: low er_. newest becomes new e s t _, since est never got a merge of its own. [Show me](#play:suffixes)

The order matters. In [The order of the merges matters](#example:order-matters), e r is learned before h e (9 times against 6). So in her the e goes with the r first: h er_. Taking the longest token at each place would give he r _. BPE never looks for long tokens. It replays its list. (WordPiece does take the longest piece: see [the WordPiece page](/wordpiece/), and press Compare to run both on the same text.)

```check
Q: BPE learned two merges, in this order: 1. e r → er, 2. h e → he. With no end-of-word marker, what does it make of her?
* h er
- he r
- her
- h e r
= Merge 1 comes first and takes the e: h er. Merge 2 needs an h next to an e, and there is none left.
```

A character that never occurred in training has no token at all. In [A letter never seen becomes [UNK]](#example:unknown-letter), the toy corpus has no j, so jumped becomes [UNK] u m p ed_.

## Variants

**The end-of-word marker.** SLP3 ends each word with _, so at_ at the end of a word and at inside one are different tokens. In [Without an end-of-word marker](#example:no-end-marker), at is merged third (17 times, from cat, sat, mat and ate) and ate becomes at e. With the marker, ate is a t e_. GPT-2 has no marker. It keeps the space in front of a word as part of its first token instead, so "the" at the start of a text and " the" after a space are different tokens.

**Ties.** Papers rarely say what happens when two pairs have the same count. Sennrich et al.'s code takes the first one it met, the default here. In [A tie, broken alphabetically](#example:tie-break), after e_ both t h and h e_ occur 29 times; alphabetically h e_ wins, and the is built as t + he_. Same token, different route, and that changes what other words get: that is th a t _ one way and t h a t _ the other. [Show me](#play:tie-break)

**Bytes.** Start from the 256 byte values of UTF-8 instead of characters and no word can ever be unknown. A letter like é is two bytes, C3 and A9. In [Bytes: an accent is two bytes](#example:bytes), they occur together 11 times, so the first merge glues them back into é. The ê of fête also starts with C3 but is rare, so it stays two bytes, ‹C3› ‹AA›. Ugly, but encoded. GPT-2 works this way.

## BPE and compression

Training is compression. The toy text goes from 420 tokens to 193, and each merge is an entry in a dictionary that a decoder can undo. Compare it with [Huffman coding](/huffman/), which keeps the symbols and gives frequent ones short codes, and with [LZW](/lz-compression/), which adds a new string to its dictionary every time it reads one it has not seen. BPE builds its dictionary greedily, one most frequent pair at a time, before it reads the text it will encode. Gage's version did exactly that with bytes.

## When to use it

BPE is the default for language models: GPT-2 and its successors, Llama, and many more. With bytes it handles any language, emoji and typos without an unknown token. Frequent words cost one token and rare words a few, which keeps sequences short where it matters.

Avoid reading meaning into the pieces. They are what was frequent, not morphemes: with 20 merges walking is w alk i n g_, because ing occurs only three times in the toy corpus. Text in a language the training data saw little of gets cut into many short tokens, so it costs more. And a vocabulary belongs to its model. Encode with another model's merges and the token numbers mean nothing.

## Common mistakes

- Counting each different word once. A word that occurs 29 times adds 29 to each of its pairs.
- Forgetting to count again after a merge. The merged pair is gone, and new pairs (th e_) appear.
- Encoding by taking the longest token in the vocabulary. That is WordPiece. BPE replays its merges in order, and the answers can differ.
- Expecting a merge to save as many tokens as its count. Pairs can overlap: in [Overlapping pairs count too much](#example:overlap), aaaa has three a a pairs, so a a counts 9, but merging joins them two at a time and the text shrinks by 6.
- Merging across words. A pair is two neighbours in one word, never the end of one word and the start of the next.
- Training with one setting and encoding with another, say with the marker and without it. The merges no longer match.

## At real scale

GPT-2 (2019) uses byte-level BPE with 256 bytes, 50 000 merges and one end-of-text token: 50 257 tokens. Llama 2 (2023) has 32 000 tokens, and Llama 3 (2024) 128 000. The toy here learns 20 merges on top of 22 symbols, on 99 words. Same algorithm, a few orders of magnitude less patience required.

## Try this

- [Train on the toy corpus](#example:toy-corpus): encode talks and boxed. Which merges does each one use?
- Set the merges to 30 and train again. Does walking get an ing? Why not?
- [Shared pieces become tokens](#example:suffixes): encode widest. Then change the text to make est a token.
- [A tie, broken alphabetically](#example:tie-break): switch the tie rule back and step through the second merge.
- Load aaaaaa (six a's) and press One merge. Why does a a count 5 but the text shrink by only 3?
- Switch Start from to UTF-8 bytes, load your name with its accents, and train.
