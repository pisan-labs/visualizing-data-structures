# LFU cache

An [LRU cache](/lru-cache/) throws out whatever was used longest ago. An LFU (least frequently used) cache throws out whatever was used the fewest times, and when two keys are tied, the one used longest ago. The bet is different: what has been popular stays popular. Counting sounds like it needs a sort, or at least a heap. It does not. With a list per count, get and put are both O(1).

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `get(k)` | returns k's value and counts a use, or returns −1 | O(1) |
| `put(k, v)` | stores v under k and counts a use; a new key in a full cache evicts one | O(1) |
| `put(k, v)`, scanning every key | the obvious design: look at every key for the fewest uses | Θ(n) to evict |

Three parts, drawn top to bottom:

1. **map**: a hash map from each key to its node. The node holds the value and the key's frequency, how many times it has been used.
2. **lists**: a hash map from each frequency f to a doubly linked list of the nodes used f times, least recently used first.
3. **minFreq**: the smallest frequency in use, marked "min".

To evict, take the head of lists[minFreq]: the least recently used of the least used keys. No search. [Show me](#play:evict-least-used)

The **Approach** option switches to the obvious design. Both evict the same keys. The variables count the work over the whole run: `lookups` (reads and writes of the key map), `links` (splices: taking a node out of a list or adding one at its end) and `scans` (keys looked at while searching for the one to evict). `naive total` and `pattern total` say what each design has cost so far on these same calls.

## How it works

Every use, a hit or a put of a cached key, moves the key's node up one frequency:

1. unlink it from lists[f]: O(1), since it knows both its neighbours;
2. if lists[f] is now empty and f was minFreq, minFreq becomes f + 1;
3. append it at the tail of lists[f + 1], making that list if it is new.

A new key gets a node with frequency 1 at the tail of lists[1], and minFreq = 1, since nothing is used less than a new key. If the cache is full, evict first.

In [Evicting the least used key](#example:evict-least-used), the cache holds 3. Put 7, 8 and 9, then use 7 twice and 8 once. The lists end as freq 1: 9; freq 2: 8; freq 3: 7, and minFreq = 1. put(5, 50) evicts 9, the head of the freq-1 list, and get(9) misses.

Why is each list in order of last use? A node joins a list at its tail exactly when it is used, so the head of each list is the one used longest ago. The tie rule comes for free. In [A tie goes to the least recent](#example:tie-goes-to-lru), 8, 9 and 7 are all used twice, in that order, so the freq-2 list is 8, 9, 7 and put(5, 50) evicts 8. [Show me](#play:tie-goes-to-lru)

```check
Q: Capacity 3. The lists are freq 1: 8, 9 and freq 2: 7 (least recent first). Which key does put(5, 50) evict?
* 8
- 9
- 7
- None: 5 replaces nothing until a get
= The cache is full, so evict the head of lists[minFreq]. minFreq is 1, and the head of the freq-1 list is 8, the one used longest ago.
```

## minFreq only ever steps up by one

minFreq looks like it needs a search: after a key moves up, which frequency is now the smallest? It never does. A use moves one key from f to f + 1. If that emptied the smallest list, the smallest frequency is now f + 1, where the key just went. And a new key sets it straight back to 1.

[minFreq moves up, then back to 1](#example:min-freq-moves): put(7, 70) makes minFreq 1, each get(7) moves it up, to 2 and then 3. put(8, 80) brings it back to 1. get(8) empties the freq-1 list, and minFreq becomes 2, not 3. One step at a time.

A put of a cached key is a use too, so it moves up like a hit. [A put counts as a use](#example:update-is-a-use): put(7, 71) moves 7 to the freq-2 list, so the next eviction takes 8 instead.

```check
Q: The lists are freq 1: 6; freq 3: 7, 8, and minFreq = 1. What is minFreq after get(6)?
- 1
* 2
- 3
- 4
= 6 moves to a new freq-2 list and the freq-1 list is empty. It was the smallest, so minFreq goes up by one, to 2. 7 and 8 stay at 3.
```

## The obvious design: scan every key

Keep a map from each key to its value, its count and when it was last used. get and put are one lookup and a count. Evicting looks at every key for the fewest uses, the oldest last use breaking a tie: Θ(n).

[Scanning every key to evict](#example:scan-every-key) runs the same calls as the first example. put(5, 50) looks at all three keys (7 used 3 times, 8 twice, 9 once) to find 9. The whole run takes 13 lookups and 3 scans, 16 in all. The lists take 13 lookups and 11 links, 24. So with 3 keys the scan wins! A hit costs the lists two splices, and this run evicts only once.

The scan loses when the cache is big. A cache of 10,000 keys looks at 10,000 of them on every eviction; the lists still do one lookup and a couple of splices. A min-heap keyed by (count, last use) sits in between, O(log n) for every get and put, as on [binary heap](/binary-heap/).

## LFU against LRU

LFU shines when a few keys stay popular and a stream of one-off keys goes by. [A hot key survives a scan](#example:hot-key-survives): 7 is used 3 times, then 8, 9, 5 and 6 come once each. Each new key pushes out the oldest key used once, and get(7) at the end hits. Run the same calls on the [LRU cache](/lru-cache/) with capacity 3 and get(7) misses: 7 went when 5 came in.

The same memory is LFU's weakness. In [Old favourites hang on](#example:old-favourites), 7 and 8 are used 3 times each early, then never again. The new keys 9, 5 and 6 fight over the one slot left, and get(5) misses because 6 has just evicted it. Popular once means popular forever. One fix is to age the counts, say halve them every so often, so old favourites fade. TinyLFU, a cache policy by Einziger, Friedman and Manes, does just that: after a fixed number of requests it halves every count. Nothing fancy, but it changes the bet.

And with [Room for one](#example:capacity-one) entry, counts do not matter at all: there is only one key to evict.

## When to use it

Use LFU when popularity is stable: a catalogue's best sellers, a font's common glyphs, the same few queries all day. Use LRU when what matters shifts over time, and recency is the better guess. Both are a hash map plus doubly linked lists: LRU keeps one list in order of use, LFU one per frequency.

## Spot it

Reach for this design when the problem says:

- **"the fewest times"**, **"least often"**, **"least popular"**: eviction by count, not by recency;
- **"on a tie, the one unused longest"**: recency breaks ties, so each count needs its own list in order of use;
- **"O(1) for every call"**: no scan and no heap.

Three problems of our own:

- A cache of the 500 most popular product pages drops the page asked for the fewest times when full, and between two asked for equally often, the one unused longer. Every call must be O(1).
- A font renderer caches glyphs, and glyphs drawn all the time should survive a burst of rare ones: evict by how often a glyph was drawn, not how recently.
- A cache of query results keeps the queries asked most often, and with a tie drops the one asked longest ago.

Look-alikes: "close the app opened longest ago" is recency alone, an [LRU cache](/lru-cache/). "After a day of searches, list the 10 most searched words" evicts nothing along the way: count, then keep a heap of the top 10.

## Common mistakes

- Appending a used node at the head of its new list instead of the tail. The lists then run most recent first, and a tie evicts the wrong key.
- Moving minFreq whenever a list empties. Only when the emptied list was the smallest; if a key moves from 5 to 6 while minFreq is 1, minFreq stays 1.
- Forgetting minFreq = 1 for a new key. The next eviction then looks in the wrong list.
- Not counting a put of a cached key as a use. Here it counts, as a hit does; check what your problem says.
- A singly linked list. Unlinking a node from the middle needs the node before it, which a [doubly linked list](/doubly-linked-list/) keeps and a singly linked one has to walk to.
- Evicting before checking whether the key is already cached. A put of a cached key in a full cache evicts nothing.

## Try this

- [Evicting the least used key](#example:evict-least-used): before you play it, write down the lists after each call. Which key will put(5, 50) evict?
- [A hot key survives a scan](#example:hot-key-survives), then the same calls on the [LRU cache](/lru-cache/). Which one hits at the end?
- Press Compare, pick this page with other options, and set one side to scanning every key. Start over with "A hot key, then a scan of new keys" and watch `naive total` and `pattern total`. Then set Capacity to 4 and try again.
- [Old favourites hang on](#example:old-favourites): how many new keys would you need before 7 or 8 goes? (Trick question.)
- Put 7, then get(7) four times. What is minFreq, and how many lists are there?
