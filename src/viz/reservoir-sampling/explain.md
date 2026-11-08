# Reservoir sampling

You want k random items from a stream: lines of a log file too big for memory, tweets going by, packets on a network. You see each item once, you don't know how many are coming, and when the stream stops you want a sample in which every item had the same chance. Reservoir sampling does it with k slots of memory and one random number per item.

```
R = empty reservoir of size k
for each item i = 1, 2, … of the stream
  if i ≤ k:  R[i] = item i
  else j = RANDOM(1, i)
    if j ≤ k
      R[j] = item i
```

This is Algorithm R, which Knuth credits to Alan Waterman. It is one of those algorithms that looks too simple to be right.

| | Cost |
|---|---|
| Time | O(n): constant work per item |
| Memory | O(k), however long the stream |
| Chance each item is in the sample | k/n |

## How it works

The first k items go straight into the reservoir. After that, item i is kept with probability k/i: draw j from 1 to i, and if j lands on one of the k slots, the new item replaces whatever is in that slot. Otherwise it is skipped, and never seen again. [Show me](#play:ten-items)

Why k/i? After i items, a fair sample of k should hold each of them with probability k/i. So the new item must get in with exactly that chance. The page shows it under the reservoir at every step.

```check
Q: The reservoir holds k = 2, and item 5 arrives. With what probability is it kept?
- 1/5
* 2/5
- 1/2
- 3/5
= Draw j from 1 to 5 and keep it when j ≤ 2: 2 chances in 5.
```

## Why it is fair

Early items get in easily (the first k for free) but then face many chances of being replaced. Late items have a hard time getting in, but face few replacements. The two effects cancel exactly.

Take item i ≤ n. It gets in with probability k/i (or 1, if i ≤ k). Each later item j replaces it with probability (k/j)·(1/k) = 1/j, so it survives item j with probability (j − 1)/j. Multiply it all:

k/i · i/(i+1) · (i+1)/(i+2) · … · (n−1)/n = k/n.

The product telescopes. Every item, early or late, ends up in the sample with probability k/n. Don't take my word for it: type 5000 and press **Run trials**. The page samples 2 from a stream of 8, five thousand times, and counts how often each item is kept. [Every count near 1250](#play:counts-even-out)

```check
Q: k = 1, and the stream has 6 items. What is the chance that item 1, which got in for free, is still there at the end?
- 1
- 1/2
* 1/6
- 5/6
= It must survive items 2 to 6, each of which replaces it with probability 1/j: (1/2)(2/3)(3/4)(4/5)(5/6) = 1/6. The same as every other item.
```

## The size of the reservoir

Change **Reservoir size k**. With k = 1 you get a single random item: item i replaces it with probability 1/i. [A sample of one](#example:keep-one) With k = 4 out of 8, every item is kept half the time. [A bigger reservoir](#example:bigger-reservoir)

## When to use it, and common mistakes

Use it whenever the data comes as a stream, or is too big to load: sampling a huge file in one pass, monitoring traffic, picking a random line from a file without counting its lines first. Databases use it for `TABLESAMPLE` and for statistics on big tables. When the stream is very long, Algorithm L does the same job but skips ahead over items it would not keep, so it draws far fewer random numbers.

Common mistakes:

- Keeping item i with probability 1/i when k > 1. That is right for k = 1 only.
- Drawing j from 0 to i (or 1 to i − 1). Off by one, and the sample is no longer uniform.
- Taking the first k items of the stream "because it is random anyway". Streams are rarely in random order: logs are sorted by time.

One variant looks like a mistake but isn't: draw j from 1 to i, keep the item if j ≤ k, then pick the slot to replace with a second random number. The sample is still uniform. It just wastes a random number, since j is already a uniform slot when j ≤ k.

## Try this

- Offer A B C D E F one at a time with k = 2. Before each offer, say the chance that item is kept.
- Stream 16 items with k = 1 a few times (press Stream again for new random draws). Does any position win more often?
- Run 100 trials, then 5000. How close to even are the counts each time?
- Why does item 8 have only one chance to get in, and item 1 six chances to be replaced?
