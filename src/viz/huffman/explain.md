# Huffman coding

ASCII spends 8 bits on every character. In English text e is far more common than z, and both still get 8 bits. Huffman coding gives frequent symbols short codes and rare symbols long ones. No code is the start of another, so the bits need no separators: a decoder always knows where one code ends.

The idea came from a term paper. In 1951 Robert Fano gave his information theory class at MIT a choice between a final exam and a paper on finding the most efficient binary code. David Huffman wrote the paper and found the method on this page, published in 1952. He skipped the exam.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `build(text)` | Counts the symbols, then merges trees until one is left | O(m + n log n) |
| `encode()` | Replaces each symbol of the text with its code | O(m + B) |
| `decode(bits)` | Walks the tree, one step per bit | O(B) |

n is the number of different symbols, m the length of the text, and B the number of bits. **Load only** and **Merge two** under More operations do the build one piece at a time.

## Build: merge the two lightest

Count each symbol and make a leaf for it, weighted by its count. Put all the leaves in a priority queue, lightest first. Then, until one tree is left:

- take the two lightest trees out of the queue;
- make a new node that weighs as much as both, with the first one on its left and the second on its right;
- put the new tree back in the queue.

n symbols take n − 1 rounds. Read each code off the finished tree: a 0 for every left edge on the way down, a 1 for every right edge. [One common letter, four rare ones](#example:abracadabra) builds the tree for abracadabra: a appears 5 times and gets a 1-bit code, while b, c, d and r get 3 bits each. [Show me](#play:abracadabra).

The rare symbols are merged first, so they end up deep in the tree, with long codes. The common ones join late and stay near the root.

```check
Q: The counts are a:5, b:2, c:1, d:1. How many bits does the whole message take with Huffman codes?
- 9
* 15
- 18
- 20
= c and d merge first (weight 2), then b joins that tree (4), then a joins last. a gets 1 bit, b 2 bits, c and d 3 bits each: 5 + 4 + 3 + 3 = 15. A fixed-length code needs 2 bits for each of the 9 symbols, 18 bits.
```

## Ties

When two trees weigh the same, which comes out first? The algorithm doesn't care, but a program has to decide, and the **When two trees weigh the same** option picks the rule. The default takes leaves first, in symbol order, and then merged trees, oldest first. The other takes merged trees first.

The rule changes the codes. It never changes the total. [Another tie rule, other codes, same total](#example:tie-rule) builds abracadabra again with merged trees first: c and d get 4-bit codes instead of 3, r gets 2 bits instead of 3, and the message still takes 23 bits. Every Huffman tree for the same counts is optimal. It turns out that the default rule, leaves first, also keeps the longest code as short as it can be.

So two correct programs can print different codes for the same text. Both are right. That's why the code tabs on this page follow the default rule exactly.

## Why no code is the start of another

Every symbol sits at a leaf, and its code is the path from the root to that leaf. A path that ends at a leaf can't continue on to another leaf. So no code is a prefix of another, and you can glue the codes together with no commas and still read them back.

## Decode: walk the tree

Start at the root. Read a bit: go left on 0, right on 1. When you reach a leaf, write its symbol and jump back to the root. [Decoding walks the tree](#example:decode-walk) turns 01101110 into abra, one leaf at a time. [Show me](#play:decode-walk).

If the bits run out while you are partway down the tree, they are not a message in this code. 011 reaches a, and then 11 stops halfway to b or r.

```check
Q: The codes are a = 0, b = 110, c = 100, d = 101, r = 111. What does 1100111 decode to?
* bar
- bad
- abr
- It is not a message
= 110 is b, 0 is a, and 111 is r. Each code stops at a leaf, so there is only one way to cut the bits.
```

## How good is it?

A fixed-length code for n symbols needs ⌈log₂ n⌉ bits each. A Huffman code is never worse, because a fixed-length code is a prefix code too, and Huffman finds the best prefix code for the counts. Sometimes it is no better: with [equal counts](#example:equal-counts) of four symbols, every code has 2 bits either way.

The gain comes from uneven counts. [Fibonacci counts](#example:fibonacci-counts), where each count is the sum of the two before it, make the most lopsided tree there is: codes from 1 bit up to n − 1 bits. [A sentence, spaces and all](#example:sentence) saves 11 bits out of 60. Information theory gives the floor: the average code length can't go below the entropy of the counts, and a Huffman code stays less than one bit per symbol above it.

A [single symbol](#example:one-symbol) is the odd case. Its path from the root is empty, but a code needs at least one bit, so it gets 0.

## When to use it, and when not to

Use Huffman coding when the symbol counts are uneven and known, or cheap to count first. It is one stage of DEFLATE, the compression inside zip, gzip and PNG, and baseline JPEG uses it too.

It has limits. The decoder needs the codes, so they travel with the message. Real formats send only the code lengths and rebuild the codes from those in a fixed order. Each symbol costs at least one bit, which wastes space when one symbol is nearly everything; arithmetic coding can do better there. And Huffman coding looks at one symbol at a time, so it can't notice that q is almost always followed by u. DEFLATE runs another stage first to catch repeated strings.

## Common mistakes

- Sorting the counts once and pairing them up in order. The merged tree has to go back in the queue, because it may be lighter than trees still waiting.
- Putting the merged tree at the end of the queue whatever it weighs.
- Expecting one right answer for the codes. Ties change them; only the total is fixed.
- Reading a code from the leaf up to the root. That gives the bits backwards.
- Giving a lone symbol an empty code.
- Decoding without checking that the bits end at the root.

## Try this

- [One common letter, four rare ones](#example:abracadabra). Before each merge, say which two trees come out.
- Switch the tie rule in Options, build abracadabra again, and compare the codes and the total.
- Fill with **Equal counts (a balanced tree)**, then **Fibonacci counts (the deepest tree)**, both with 8 symbols. Compare the longest codes.
- Type your name and press **Build**, then **Encode**. How many bits does it save over a fixed-length code?
- Use **Load only** and press **Merge two** yourself, one round at a time.
- [Decoding walks the tree](#example:decode-walk), then decode the same bits with one bit flipped.
