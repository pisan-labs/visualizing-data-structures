# Which pattern fits?

Most interview problems are one of a few dozen tricks in disguise. Knowing the tricks is the easy half. The hard half is reading a problem you have never seen and knowing which trick it wants. This page is a map for that: short cues of the kind a problem statement contains, the pattern each cue calls for, and the page that teaches the pattern. 11 families, 51 patterns, 89 cues.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| follow(cue) | find the cue in its family, hop to its pattern, then to its page | O(1) expected |
| show(F) | a family's patterns, each with the cues that point to it | Θ(p + c) |
| which(problem) | read one of our problems cue by cue, to the pattern it needs | Θ(k) for k cues |
| map() | the families, one at a time | Θ(f) |

A cue is a few words that say what shape the data has, or what is asked for. "The k largest" is a cue: keep a min-heap of the best k so far. Press Follow cue and the map takes two hops, cue to pattern with the reason, then pattern to page. [Show me](#play:k-largest)

Each family is drawn as cues on the left and patterns on the right. A pattern whose page is not live yet has a dashed box and says so; its arrows are still worth reading.

The map itself is a dictionary from cue to pattern, and the code tabs show exactly that. The skill is in noticing that the words in front of you are a cue at all.

## Reading a problem for cues

Read a statement three times, with a different question each time.

1. What is the data? An array, a string, a linked list, intervals, a grid, a stream that keeps arriving, threads.
2. What is asked for? A count, the best value, an order, a yes or no, every answer, the k best.
3. What are the limits? Values can be negative, the input is sorted, memory is constant, n is at most 20.

Problem 1 reads "A gauge logs how far a river rose or fell each hour. Count the stretches of consecutive hours over which it rose by exactly 30 cm." "Rose or fell" says values can be negative. "Count the stretches of consecutive hours" plus "exactly 30" is a count of stretches with a given sum. Both point to [prefix sums with a hash map](/prefix-sum-hashmap/). "A gauge logs" points to nothing, and that is most of any statement. [Two cues that agree](#example:river-levels)

One cue can be enough. In [One cue is enough](#example:halfway-node), "the node halfway along it" is the middle of a list, and the fast and slow pointers find it in one walk.

```check
Q: "A shop takes a million orders a day. Keep the 10 largest orders seen so far, with memory for only those 10." Which fits?
- Sort all the orders, then take the last 10
* A min-heap of the 10 largest so far
- Quickselect for the 10th largest
- Two heaps, a low half and a high half
= "The 10 largest" is the cue, and "memory for only those 10" rules out the rest: sorting and quickselect both need every order in memory at once. The heap's root is the 10th largest so far, and a new order gets in only if it beats it.
```

## Look-alikes

Some words look like a cue for the wrong pattern. That is where most wrong turns come from, so the map follows them too and says why they do not fit (the option **Rule out look-alike cues** turns this off).

Problem 2: "For every block of 10 minutes in a row, report the highest reading in it." "Every block of 10 in a row" looks like a [sliding window](/sliding-window/). A window keeps a sum up to date by subtracting the value that leaves. A maximum cannot be subtracted. The real cue is "the highest reading in it", the maximum of every window, which is a [monotonic queue](/monotonic-queue/). [A window that cannot subtract](#example:warmest-block)

Problem 3 asks for the most bookings in progress at the same moment. "Some of them overlap" looks like [merge intervals](/merge-intervals/), but merging forgets how many were open at once. The question wants a count over time, and that is a [sweep line](/sweep-line/). [Overlap is not always merging](#example:hall-bookings)

```check
Q: "A cache holds 100 entries. When it is full, drop the entry used the fewest times, and among those, the one used least recently." Which pattern?
- An LRU cache: a hash map and a list in order of use
* An LFU cache: a list of keys for each use count
- Top k with a heap of the use counts
= The main rule is how often an entry was used; recency only breaks ties. "Least recently" is the look-alike.
```

## Naive first

Before you reach for a pattern, say the naive solution out loud, and count its work. It gives you an answer to test the clever one against. It shows where the work goes, and the pattern is usually that waste taken away. And in an interview a working O(n²) beats an unfinished O(n).

Most pattern pages in this pathway have an **Approach** option: the naive way or the pattern, with counters for the work of each. Compare runs the two side by side on the same input. On [prefix sums](/prefix-sum-hashmap/), eight values take 36 sums for every pair of ends against 8 sums and 16 lookups with the pattern. On four values the naive way wins, 10 steps against 12. Big-O is about large n, and the pages say so when the pattern loses.

With **Say what the naive way costs** on, every hop to a pattern here ends with both costs. Follow [“the middle of a list”](#example:middle-of-list) and the map says: count the length first or copy to an array, against one walk and O(1) extra space.

Concurrency turns this around. The naive version is the code with no locks, and it works most of the time, which is worse than not working. So the map says what goes wrong, and the fix. [Follow “two locks, opposite orders”](#example:lock-order)

## The families

Each family groups patterns by where you would look for them. A few pages from other pathways sit with the family that needs them: cycle detection with the linked list tricks, binary search and backtracking with the search templates, the LRU cache and the trie with the design problems, bitmasks with the bit tricks. Three graph pages make a family of their own.

| Family | Look here when the problem has | Some of its patterns |
|---|---|---|
| 1. Array and string tricks | one pass over a list, a count, a running value | [prefix sums](/prefix-sum-hashmap/), [Kadane](/kadane/), [frequency counting](/frequency-counting/), [cyclic sort](/cyclic-sort/) |
| 2. Techniques | indices or a stack moving through an array | [two pointers](/two-pointers/), [sliding window](/sliding-window/), [monotonic stack](/monotonic-stack/) |
| 3. Intervals | starts and ends | [merge intervals](/merge-intervals/), [sweep line](/sweep-line/) |
| 4. Linked list tricks | pointers and no index | [fast and slow pointers](/fast-slow-pointers/), [cycle detection](/floyd-cycle/), [reverse in groups](/reverse-k-group/) |
| 5. Heap patterns | the best few, the next smallest of several | [top k](/top-k/), [k-way merge](/k-way-merge/), [two heaps](/two-heaps-median/) |
| 6. Search templates | a space of answers or states | [binary search](/binary-search/), [binary search on the answer](/binary-search-answer/), [BFS over states](/state-space-bfs/), [backtracking](/backtracking/) |
| 7. Graphs | routes, prerequisites, groups | [Dijkstra](/dijkstra/), [topological sort](/topo-indegree/), [union-find](/disjoint-sets/) |
| 8. Bit tricks | bits as a set, values that cancel | [XOR tricks](/xor-tricks/), [bitmasks](/bitmask/) |
| 9. DP patterns | a best or a count from smaller answers | [DP on a grid](/dp-grid-paths/), [states over time](/dp-state-machine/), [DP on trees](/dp-tree/), [DP over subsets](/dp-bitmask/) |
| 10. Design a data structure | a few operations that must all be fast | [min stack](/min-stack/), [LRU cache](/lru-cache/), [LFU cache](/lfu-cache/), [rate limiter](/rate-limiter/), [trie](/trie/) |
| 11. Concurrency | threads sharing memory | [race conditions](/race-condition/), [mutex](/mutex/), [semaphores](/semaphore/), [deadlock](/deadlock/) |

Concurrency is the largest family, with 9 patterns and 15 cues. [Concurrency, the largest family](#example:concurrency-family) The smallest are Intervals and Bit tricks, with two patterns each. [The array and string tricks](#play:array-family) has 7 patterns and 13 cues.

## Spot it

Three problems of our own, not on the map. Find the cue before you look at the answer.

- A row of buildings of different heights. For each one, find the first taller building to its right. ("The first taller one to its right" is the next greater value: a monotonic stack.)
- As someone types a name into a phone, show every contact that starts with the letters so far. ("Starts with the letters so far" is a prefix, and as you type: a trie.)
- Three workers each need two of four tools at once and pick them up one at a time. Sometimes the whole shop stops. ("Pick them up one at a time" and "stops" for good: a deadlock. One fixed order for picking up tools fixes it.)

The Practice tab asks the same thing about our 12 problems: which pattern, which family, and which words give it away.

## When the map is not enough

A cue narrows the search. It does not solve the problem. Plenty of problems need two patterns at once: sort, then two pointers; binary search on the answer, with a greedy check inside. And some statements have no cue at all. Then the naive solution is the place to start, and its slow part tells you what to look up.

The map also knows only its own 89 phrases. Type a phrase that contains one, such as "find the k largest values", and Follow cue finds it. Type "top elements" and it finds nothing. The cues are short on purpose: learn them, and recognize them in longer words.

## Common mistakes

- Matching on one word. "Subarray" and "sum" do not mean a sliding window until you know there are no negative values.
- Skipping the limits. "n is at most 20" and "constant extra memory" are cues as much as "the k largest" is.
- Treating "sorted" as binary search every time. A pair with a given sum in a sorted array is two pointers.
- Reaching for the pattern before you can say the naive solution. Then there is nothing to test it against.
- Trusting a test run for threads. A race that loses an update once in a thousand runs passes 999 of them.

## Try this

- [Follow “the k largest”](#example:k-largest), then type "the k-th smallest value" and press Follow cue. Same page; which heap keeps it?
- [Two cues that agree](#example:river-levels): before you play it, find the cue words yourself.
- [A window that cannot subtract](#example:warmest-block) with **Rule out look-alike cues** off. Which steps disappear?
- [Concurrency, the largest family](#example:concurrency-family): which cue would you add for barriers?
- [The whole map](#play:whole-map): then show the family you know least, by its number.
- Press Which pattern? with each number from 1 to 12, and guess the pattern before the last step.
