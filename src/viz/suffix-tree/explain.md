# Suffix tree

Take every suffix of a text and put them all in one trie. Then squash every chain of single children into one edge. That is a suffix tree.

Why bother? Every substring of the text is the start of some suffix. So "does P occur in T?" turns into "can I walk P down from the root?" The walk looks at |P| characters, and the length of T does not come into it at all. A 10-character pattern costs about the same in a 10-character text as in the human genome.

## The idea and the costs

Add an end marker `$` to the text first. It appears nowhere else, so no suffix is a prefix of another one, and every suffix ends at its own leaf. Label each leaf with the position where its suffix starts. BANANA$ has 7 suffixes, so its tree has 7 leaves.

| Operation | What it does | Cost |
|---|---|---|
| build | Put every suffix of T$ in the tree | O(n²) simple, O(n) Ukkonen |
| `search(P)` | Walk P down; the leaves below say where it occurs | O(m + k) |
| `count(P)` | The same walk, then count the leaves below | O(m + k), or O(m) with stored counts |
| longest repeat | The deepest internal node, in characters | O(n) |

Here n = |T|, m = |P| and k is the number of times P occurs. The times assume a small, fixed alphabet, so finding the right child of a node is O(1).

The tree has n + 1 leaves and at most n internal nodes, since every internal node (other than the root) has at least two children. An edge stores its label as two numbers, a start and an end in T$, never as a copy of the text. So the whole tree is O(n) space, even though the labels on paper add up to O(n²) characters. [BANANA](#example:banana)

## Building it one suffix at a time

The simple build inserts the suffixes longest first. Each one walks down from the root while its characters match. When it runs out of matching edge, one of two things happens:

- no edge out of the current node starts with the next character: hang a new leaf there;
- the suffix and the edge disagree halfway along the edge: split the edge with a new internal node, and hang the leaf off that.

The `$` guarantees the suffix never ends in the middle of an edge. Without it, A in BANANA would be a prefix of ANA and ANANA, and it would have no leaf of its own. [Show me](#play:banana)

This is O(n²) in the worst case. In AAAAAA, suffix i walks n − i characters before it finally splits off. [One letter repeated](#example:all-same)

```check
Q: How many leaves does the suffix tree of MISSISSIPPI$ have?
- 11
* 12
- As many as there are different letters
= One leaf per suffix of MISSISSIPPI$, and there are 12 of them, counting $ on its own.
```

## Ukkonen's algorithm

Ukkonen builds the same tree in O(n), reading T$ once, left to right. Switch **Build by** to Ukkonen's online algorithm to see it. Three tricks do the work.

First, a leaf never stops being a leaf, so its edge just runs to "the current end". Adding a character to the text grows every leaf at once, for free.

Second, the active point (a node, an edge and a length) remembers where the next suffix still to insert ends, and `remainder` counts how many are waiting. When the new character is already there (rule 3), every shorter suffix is there too, so the phase stops early. In BANANA the A, N, A after BAN all wait like this, and then `$` forces them out one after another.

Third, suffix links. A node for xα points to the node for α, so after an insertion the algorithm jumps sideways instead of walking down from the root again. Links to the root are not drawn, to keep the picture readable. [Show me](#play:ukkonen-banana)

Ukkonen is hard to follow the first time. And the second time. Step through it with the detail level on Every detail and keep an eye on the active point in the variables panel.

## Search, count and the longest repeat

To search, walk P down from the root. Fall off the tree and P is not in T. Get to the end of P (at a node or partway along an edge) and every leaf below is a suffix that starts with P, so the leaf labels are the positions. [Count ANA](#example:count-ana) walks A, then NA, and finds two leaves: positions 1 and 3, overlapping.

A substring that occurs twice starts two different suffixes. Their paths share it and then split, which needs an internal node. So the longest repeated substring is the path label of the deepest internal node, counting characters rather than edges. In MISSISSIPPI it is ISSI. [Show me](#play:mississippi)

```check
Q: In the suffix tree of ABCDEF$, how many internal nodes are there besides the root?
* 0
- 1
- 6
= Every suffix starts with a different letter, so each one leaves the root on its own edge. Nothing repeats.
```

## Suffix tree or suffix array?

The [suffix array](/suffix-array/) is the same idea flattened: the leaves of the suffix tree, read left to right, are the suffix array, and the LCP array holds the depths of the internal nodes between neighbours. Open both pages in compare mode on BANANA and you can match the leaves 6, 5, 3, 1, 0, 4, 2 to the rows of the suffix array (here with the `$` suffix first).

So which one? The tree answers faster and does more: longest common substring of two texts, matching statistics, and so on. The array takes about 4 bytes per character instead of 10 to 20 for a careful tree, and it is much easier to get right. In practice people mostly use suffix arrays, and reach for a tree (or simulate one on top of the array) when an algorithm needs it.

Avoid both when the text changes a lot, or when you search once. One KMP pass over the text is O(n + m) and needs no index at all.

## Common mistakes

- Forgetting the `$`. Some suffixes then end inside an edge, have no leaf, and the counts come out short.
- Storing edge labels as strings. That quietly turns O(n) space into O(n²).
- Counting depth in edges. The longest repeat is the deepest node by characters: one long edge can beat three short ones.
- Treating the end of a search inside an edge as a miss. If P ran out, it matched; the leaves below that edge count.
- Expecting the simple build to be fast on repetitive text such as DNA. That is exactly where it hits O(n²).

## Try this

- [BANANA](#example:banana). Before each insertion, guess whether it adds a leaf at a node or splits an edge.
- [Ukkonen on BANANA](#example:ukkonen-banana). Count how many phases end early with rule 3.
- [A pattern that is not there](#example:not-there): one miss inside the tree and one at the root.
- [All letters different](#example:all-different) and [one letter repeated](#example:all-same): the widest and the deepest tree for six letters.
- [The longest repeat in MISSISSIPPI](#example:mississippi). Then load ABRACADABRA and predict the repeat before you press the button.
