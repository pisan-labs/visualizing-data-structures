# Compressed trie

A plain [trie](/trie/) spends a node on every letter. Store algorithm and algebra, and everything after alg is a chain of nodes with one child each. None of those nodes decides anything; they only hold a letter. A compressed trie squeezes each chain into a single edge that holds a string. A node survives only where something happens: where the paths branch, or where a word ends.

You will also see it called a radix tree. Same idea.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insert(w)` | Adds w, splitting at most one edge | O(m) |
| `search(w)` | Is w one of the words? | O(m) |
| `delete(w)` | Removes w, merging at most one pair of edges | O(m) |
| `startsWith(p)` | Every word that starts with p, in alphabetical order | O(\|p\| + k) |

m is the length of the word and k is the number of nodes below the prefix. These are the plain trie's costs: every letter of the word still gets compared once. The difference is space. With n words there are at most 2n nodes, however long the words are, because every node other than the root ends a word or has two or more children. [Long words, few nodes](#example:long-words) stores 32 letters in 7 nodes. A plain trie needs 26 for the same words.

## Insert splits an edge

Walk down from the root. At each node, find the edge that starts with the next letter and compare the letters one by one. Three things can happen:

- No edge starts with the letter. Hang a new leaf with all the letters that are left. Done.
- The whole edge matches. Go down it and carry on with the letters that are left.
- The word and the edge part ways inside the edge. Split the edge there: a new node takes the letters they share, the rest of the old edge hangs below it, and the rest of the word becomes a new leaf next to it.

[Insert splits an edge](#example:split-edge) starts with card as one edge. care shares car with it, so card splits into car and d, and e hangs next to d. Then cat splits car into ca and r. [Show me](#play:split-edge).

A word can also run out inside an edge. Insert car into a trie that holds cart: the edge splits into car and t, and the new node gets the end mark. No new leaf this time. [A word that ends inside an edge](#example:word-ends-in-edge). And when a whole edge matches with letters left over, nothing splits at all: [a longer word needs no split](#example:extend-path).

The split is always the last thing an insert does before it finishes, so an insert splits at most one edge.

```check
Q: Insert card, then care, into an empty compressed trie. How many nodes does it have, counting the root?
- 3
* 4
- 6
- 9
= card is one edge from the root. care shares car with it, so that edge splits: a new node for car, with d below it and a new leaf e next to d. The root, the car node and two leaves make 4.
```

## Search

Search walks the same way, and an edge counts only if all of its letters match. [Four ways a search can end](#example:search-miss): no edge starts with the letter; an edge starts right but differs partway along; the word runs out in the middle of an edge; or every letter matches and the node at the end has the second ring. Only the last one finds the word. [Show me](#play:search-miss).

Running out in the middle of an edge always means no. A word that ended there would have split the edge when it went in.

## Starts with

A prefix can end partway along an edge, and that is fine. Every word below that edge starts with the prefix, so collect from the node at the edge's end. [A prefix that ends inside an edge](#example:prefix-inside-edge) asks for bana, which ends inside the edge ana. [Show me](#play:prefix-inside-edge).

## Delete merges edges back

Find the word and clear its end mark. Now look at its node:

- No children: remove it. That can leave its parent with one child and no word, so merge the parent with that child: the two edges become one. [A delete that merges two edges](#example:delete-merges).
- One child: the node is not needed any more. Merge it with its child. [Deleting a word in the middle of a path](#example:delete-prefix-merges).
- Two or more children: it still branches, so it stays.

A delete merges at most once. Afterwards the trie looks exactly as if you had inserted the remaining words into an empty one, in any order. That is the payoff of the rule that a node exists only where paths branch or a word ends: the words decide the shape, and the history doesn't matter.

```check
Q: The compressed trie holds car and cart. What does delete(car) do?
- It removes the leaf t
* It merges the edges car and t into one edge, cart
- It only clears the end mark on car's node
= Once car's mark is gone, its node ends no word and has one child. Nothing needs it, so its edge and its child's edge become one edge, cart.
```

## Patricia trees

PATRICIA (Practical Algorithm To Retrieve Information Coded In Alphanumeric) is the binary version, from Donald Morrison in 1968. Its keys are strings of bits, so every node has at most two children. A node stores the position of the next bit to test instead of the bits it skips. Search tests only those bits on the way down, so it ends by comparing the whole key with the one stored at the end. Routers have long used compressed binary tries to find the longest stored prefix of an IP address.

Real implementations don't copy strings onto the edges either. An edge keeps a position and a length into a word that is stored once. A suffix tree, which is a compressed trie of every suffix of one text, needs that trick to stay small.

## When to use one, and when not to

Use a compressed trie for many keys with long shared stretches or long tails: file paths, URLs, IP prefixes, a big word list. You keep prefix search and sorted order, and memory grows with the number of keys instead of the number of letters.

The price is code. Splits and merges are where the bugs live, and a plain trie has neither. If the keys are short and share a lot, a plain trie is nearly as small and much simpler. If you only look up whole keys, use a hash table.

## Common mistakes

- Forgetting that a word can end inside an edge. Inserting car into a trie with cart must split the edge, because the end mark needs a node to sit on.
- Skipping the merge after a delete. The trie still gives the right answers, but nodes with one child and no word pile up, and it is not compressed any more.
- Merging a node that ends a word. The word disappears with it.
- Giving a node two children whose edges start with the same letter. The walk can't tell which to take. That case is a split.
- Comparing only the first letter of an edge and assuming the rest. That is Patricia's shortcut, and it only works because of the final full comparison.

## Try this

- [Insert splits an edge](#example:split-edge). Before each insert, say which edge splits and into which two pieces.
- Insert `cart`, then `car`, then `ca`. The last two each split an edge without adding a leaf.
- Fill with **No shared prefixes (one edge per word)** and compare the node count with the number of words.
- Insert the same words here and on the [trie](/trie/) page, and compare the node counts.
- [Deleting a word in the middle of a path](#example:delete-prefix-merges), then insert car again. The split comes back.
