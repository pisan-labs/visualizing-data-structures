# Merkle tree

You download a 4 GB file in 4,000 pieces from strangers. How do you know piece 2,817 is the real one? You could ask a trusted server for the hash of every piece: 4,000 hashes. Or you could ask it for one hash, the root of a Merkle tree, and let each stranger prove their piece with about a dozen more.

A Merkle tree hashes each data block into a leaf, then hashes each pair of leaves into a parent, and so on up to a single root. The root sums up every block: change one byte anywhere and the root changes. Ralph Merkle patented it in 1979. Today it sits inside git, BitTorrent, Bitcoin, certificate transparency logs and most databases that sync replicas.

## A toy hash, on purpose

The hash on this page is FNV-1a over the characters, folded to 16 bits and shown as 4 hex digits. That's small enough to read and compare by eye. It is not cryptographic. With only 65,536 possible values, you can find two blocks with the same hash in a few hundred tries, and then every guarantee below falls apart. Real trees use SHA-256, where nobody has ever found a collision. Same tree, longer hashes.

A parent's hash is H(left ‖ right): the two children's hex strings glued together and hashed.

## The operations

| Operation | What it does | Cost |
|---|---|---|
| `build(blocks)` | Hash every block, then every pair, up to the root | O(n) hashes |
| `update(i, data)` | Rehash leaf i and the path above it | O(log n) |
| `append(data)` | A new leaf, rehash the right edge | O(log n) |
| `proof(i)` | The sibling hashes on the path from leaf i to the root | O(log n) of them |
| `verify(data, proof, root)` | Hash the data up with the proof, compare with the root | O(log n) |

## Build, and what a change does

[Hash eight blocks up to a root](#example:build-eight) builds the tree level by level: eight leaf hashes, four, two, one. Fifteen hashes for eight blocks.

Now change one block. Its leaf hash changes, so its parent's input changes, so the parent's hash changes, all the way up. Nothing else needs touching. [Change one block, and the path changes](#example:change-block) changes block 5: the dashed nodes are stale, and four hashes later there's a new root. [Show me](#play:change-block).

That's the whole point. Anyone who wrote down the old root can tell, with one comparison, that something changed. Finding *what* changed is a walk down the tree: compare the two children's hashes and follow the one that differs. That's how replicas in a database find the few rows they disagree on without sending everything.

```check
Q: A Merkle tree has 16 blocks. You change one block. How many hashes are computed again?
- 1
* 5: the leaf and one per level above it
- 16
- 31
= The leaf, then its parent, grandparent and so on up to the root. 16 blocks make 4 levels above the leaves, so 1 + 4 = 5.
```

## Inclusion proofs

To prove block i is in the tree, send the block and the hashes of the siblings of every node on its path to the root. The verifier, who knows only the root, hashes the block, combines it with the first sibling (in the right order, left or right), then with the next one, and so on. If the result equals the root, the block is in.

[Prove a block is in the tree](#example:prove-inclusion) proves block 2 of eight with three hashes. [A forged claim fails at the root](#example:forged-claim) claims block 6 is something else; the hashes climb to the wrong value and the claim is rejected. To fool the verifier you would need a different block that hashes the same, which is what a cryptographic hash makes impossible in practice. (With this page's 16-bit toy, an afternoon would do.)

A million blocks need proofs of 20 hashes. That's what lets a phone check one Bitcoin transaction without downloading the whole block.

```check
Q: Why does each proof item say which side the sibling is on?
* Because H(a ‖ b) and H(b ‖ a) are different hashes
- To make the proof longer
- Because the verifier must know the tree's height
= Gluing the two hex strings in the wrong order gives a different hash, so the verifier would end up with the wrong root.
```

## Odd levels

When a level has an odd number of nodes, the last one has no partner. Two common answers:

- **Moves up unchanged** (this page's default, close to what certificate transparency does): the lone node becomes its own parent. No hash, no proof item for that level.
- **Paired with itself** (Bitcoin): its parent is H(x ‖ x). This has a known weakness: the blocks a b c and a b c c give the same root. Bitcoin had a real bug from it.

[Append blocks one at a time](#example:append-path) and [Odd levels, paired with themselves](#example:duplicate-odd) build the same five blocks both ways. Compare the roots and the proofs for block 4.

Real systems also hash leaves and inner nodes differently (a 0 byte in front of a leaf, a 1 in front of a node), so that nobody can pass an inner node off as a leaf. This page skips that to keep the hex short.

## When to use one, and when not to

Use a Merkle tree when someone needs to check data they got from somewhere they don't trust, or when two copies of a big dataset need to find their differences cheaply: downloads, version control, replicated databases, append-only logs, blockchains.

Don't use one for secrecy. It hides nothing: hashes prove integrity, not privacy. And if you control both ends and only need to detect corruption, a single checksum over the file is simpler.

## Common mistakes

- Treating a hash as encryption. Anyone can hash a guess and compare.
- Gluing children in the wrong order in a proof.
- Recomputing the whole tree on a change. Only the path changes.
- Using a fast, short, non-cryptographic hash (like this page's) for anything real.

## Try this

- [Change one block, and the path changes](#example:change-block). Before each step, point at the next node that goes stale.
- [Prove a block is in the tree](#example:prove-inclusion). Do the verification on paper with the three hashes, then check against the steps.
- [A forged claim fails at the root](#example:forged-claim). At which level do the hashes first differ from the real path?
- Build 8 blocks, then append a ninth. How tall is the tree now, and how long is the proof for block 8?
