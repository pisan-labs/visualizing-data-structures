# Trie

A trie stores words by their letters. Each edge carries one letter, and a word is the path of letters from the root down to a node. Words that start the same way share the start of their path: car, cart and care all go through the same c, a and r. The node where a word ends gets a second ring, because "the path is there" and "the word is there" are two different things.

The name comes from re*trie*val. Most people say "try", so they can tell it apart from "tree" when both come up in the same sentence. They will.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `insert(w)` | Adds the word w | O(m) |
| `search(w)` | Is w one of the words? | O(m) |
| `delete(w)` | Removes w, and the nodes only w needed | O(m) |
| `startsWith(p)` | Every word that starts with p, in alphabetical order | O(\|p\| + k) |

m is the length of the word, and k is the number of nodes below the end of the prefix. The number of words in the trie is not in any of these. A balanced search tree of n words needs about log₂ n string comparisons per search, and each comparison can read up to m letters. A trie reads each letter of the word once and is done.

That assumes finding the child for a letter takes constant time. More on that under shape and space.

## Insert

Start at the root and take the letters one at a time. If there is an edge for the letter, go down it. If not, make a new node on a new edge with that letter and go down to it. After the last letter, mark the node as the end of a word. [Show me](#play:shared-prefixes) seven words going in. car makes three nodes; cat needs only one, because c and a are already there.

If every letter already has an edge, the insert makes no nodes at all. The word was the start of a longer word, and all it gets is the ring. [A word that is a prefix of another](#example:prefix-word).

```check
Q: Insert car, cart and care into an empty trie. How many nodes does it have, counting the root?
- 4
* 6
- 7
- 11
= car makes three nodes under the root. cart adds only t, and care adds only e. 1 + 3 + 1 + 1 = 6.
```

## Search

Search follows the same path, and it can end in three ways. A letter has no edge: the word is not there, and nothing below needs checking. Every letter has an edge and the last node has the ring: found. Every letter has an edge but the last node has no ring: the word is only the start of longer words, so search says no. [Three ways a search can end](#example:search-miss) has all three. [Show me](#play:search-miss).

Skipping the ring check is the classic trie bug. Without it, `search(ca)` says yes as soon as cart is in the trie.

## Starts with

Prefix queries are where a trie earns its keep. Walk down the prefix the way search does. If a letter has no edge, nothing starts with the prefix. Otherwise every word that starts with it lives below the node you reached, and nothing else does. Visit that subtree in preorder, taking the children from a to z, and write down every node with a ring.

The words come out sorted. Nobody sorted them. [Every word with a prefix, in order](#example:starts-with) inserts cat, care, dog, car, cart and do, in that order, and `startsWith(ca)` still lists car, care, cart, cat. [Show me](#play:starts-with). This is autocomplete: type ca, get the words that start with ca.

## Delete

First find the word, as search does. If it is not there, stop. Otherwise clear its ring. Now some nodes may lead nowhere: no children and no ring. Walk back up and cut them off one at a time, until you reach a node another word still needs (it has a ring or another child) or the root.

[A delete that prunes](#example:delete-prunes) deletes card from a trie that also holds cat. d and r go, and the walk stops at a, which cat still needs. Deleting cat then takes the rest. [Show me](#play:delete-prunes). When the word is the start of a longer one, only the ring goes: [deleting a word that starts a longer one](#example:delete-prefix-word).

Some implementations only clear the ring and never remove a node. That's the lazy setting of the **Delete** option. It's less code, and inserting the word again is cheap, but the dead nodes stay and take space until someone rebuilds the trie. [A lazy delete leaves its nodes behind](#example:lazy-delete).

```check
Q: The trie holds car, cart and cat. How many nodes does delete(cart) remove?
* 1
- 2
- 4
= Only t goes. The node above it ends the word car, so the walk back up stops there.
```

## Shape and space

The shape of a binary search tree depends on the order of the inserts. A trie's doesn't: the same words give the same trie, whatever the order. Insert `dog cat car`, clear, then insert `car cat dog`. Same trie. Sorted input, the worst case for a plain binary search tree, makes no difference here.

A trie has one node per distinct prefix of its words, plus the root. With no sharing at all, every letter gets its own node: [no shared prefixes](#example:no-shared-prefixes) puts 23 letters in 24 nodes. That is the most a trie can need, N + 1 nodes for N letters.

How a node finds its children matters too. The classic version gives every node an array of 26 child pointers, one per letter. Finding a child is one array lookup, but most slots are empty: a trie with 1,000 nodes holds 26,000 pointers, and only 999 of them point anywhere, since every node but the root has exactly one parent. Other versions keep only the children that exist, in a hash map or a sorted list. That's slower per letter and much smaller. This page draws only the children that exist, in alphabetical order. The Java and C++ tabs keep them in a sorted map; the Python tab keeps a dict and sorts its keys when it lists words. A ternary search tree goes one step further and keeps each node's children in a small binary search tree.

Long words that share little turn into chains of nodes with one child each. A [compressed trie](/compressed-trie/) squeezes each chain into a single edge labeled with a string.

## When to use one, and when not to

Use a trie when prefixes matter: autocomplete, a spell checker suggesting words, or listing the keys in sorted order. Every operation costs one step per letter, however many words there are.

If you only ever look up whole words, a hash table is simpler and usually smaller. It reads every letter too, to compute the hash, but it doesn't spend a node on each one. And if memory is tight and the words share little, one node per letter adds up fast. A compressed trie, or a sorted array of words with binary search, may do better.

## Common mistakes

- Treating "the path is there" as "the word is there". Search has to check the end mark.
- Deleting a word by cutting off its last node without checking for children. Delete car that way and cart goes with it.
- Pruning too far: removing a node that ends another word, or not stopping at the root.
- Expecting the order of the inserts to matter. It doesn't.
- Using an array of 26 children for keys that are not just lowercase letters. Capitals, digits or accented letters need a bigger alphabet or a map.

## Try this

- [Words that share a prefix share a path](#example:shared-prefixes). Before each insert, predict how many nodes it adds.
- [A word that is a prefix of another](#example:prefix-word). Watch car go in without a single new node.
- [Three ways a search can end](#example:search-miss). Say how each search ends before you play it.
- Insert `cat card cart care`, then delete cart. Which nodes go?
- Fill with **No shared prefixes (the most nodes)**, then with **Words that share prefixes** at the same size, and compare the node counts.
- Switch **Delete** to the lazy setting, delete a few words, and watch the node count stay put.
