# Dutch national flag (three-way partition)

You have values of three kinds and you want them in three groups: the values below a pivot p, then the ones equal to p, then the ones above. Edsger Dijkstra posed this in *A Discipline of Programming* (1976) as the Dutch national flag: things colored red, white and blue, to be put in the order of the flag's stripes. The trick is one pass, three indices and no extra array.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| partition(p), three pointers | below p, then equal, then above, in one pass | n comparisons, at most n − 1 swaps, O(1) extra space |
| partition(p), count then rewrite | count each kind, copy each value into place in B, copy B back | 2n comparisons, 2n writes, O(n) extra space |
| a comparison sort instead | sorts inside each group too, which nobody asked for | about n log₂ n comparisons in the worst case |

Three indices, low, mid and high, cut A into four regions, and the four regions stay true after every step:

- A[0..low − 1] is below p;
- A[low..mid − 1] is equal to p;
- A[mid..high] is unknown, not looked at yet;
- A[high + 1..n − 1] is above p.

At the start everything is unknown. Each step looks at A[mid] and makes the unknown region one smaller. When it is empty, you are done. [Show me](#play:three-kinds)

The **Approach** option switches to the naive way, counting then rewriting. Both end with the same three groups and hand back the same low and high. The variables count the work: `comparisons` asks "below, equal or above p?" of one value, `swaps` exchanges two different slots, `writes` puts one value in a slot. `naive total` and `pattern total` say what each approach costs on this input.

## How it works

Look at A[mid]:

1. **Below p:** swap it with A[low], then move low and mid on by one.
2. **Equal to p:** leave it, move mid on.
3. **Above p:** swap it with A[high], move high back by one, and leave mid where it is.

Why does mid move after case 1 but not after case 3? The value that comes to mid from A[low] has been looked at already: it is a p, the first one of the equal region (or it is the same value, when there is no p yet and low = mid). The value that comes from A[high] is from the unknown region. Nobody has looked at it.

In [Three of each kind around 5](#example:three-kinds), A = 7 2 5 9 5 1 8 5 3 and p = 5. The first step finds 7 above 5 and swaps it with A[8] = 3. high moves to 7, mid stays on the 3. The next step finds 3 below 5, but low = mid = 0, so the swap trades A[0] with itself. Later A[5] = 1 is below 5 with low = 2: it swaps with the 5 in A[2], and both regions grow by one. 9 comparisons and 3 real swaps; three more swaps move a value onto itself, and the counter skips those, as on [quicksort](/quick-sort/). The result is 3 2 1 5 5 5 8 9 7. Grouped, not sorted.

```check
Q: A = 2 0 1 and p = 1. What is A after the first step?
* 1 0 2
- 0 2 1
- 0 1 2
- 2 0 1
= A[0] = 2 is above 1, so it swaps with A[high] = A[2] = 1, and high moves back to 1. mid stays on the 1 that just arrived, since it has not been looked at yet.
```

## Count, then rewrite

The naive way takes two passes. Pass 1 counts the values below, equal to and above p. The counts say where each kind starts in a new array B. Pass 2 copies each value to the next free slot of its kind, and then B is copied back into A. That is [counting sort](/counting-sort/) with three keys.

[Count, then rewrite](#example:count-then-rewrite) runs it on the same A: 3, 3 and 3, so the 5s start at B[3] and the values above at B[6]. 18 comparisons, 18 writes and 9 extra slots, against 9 comparisons and 3 swaps in place. [Show me](#play:count-then-rewrite)

It has one thing going for it. It is stable: each kind keeps the order it came in, 2 1 3 and 7 9 8. Three pointers give 3 2 1 and 8 9 7. If the order inside a group matters, three pointers are the wrong tool.

For the real flag problem the counting can be even simpler. With [Three colors: 0, 1 and 2](#example:three-colors), a 0 is a 0, so count them and write c₀ zeros, c₁ ones and c₂ twos over A, no B needed. That only works because the values in a kind are identical. Give each value a name or a record and writing counts back throws them away.

## Why not just sort?

Sorting A puts the three groups in order too. It also sorts inside each group, which costs more: any sort that compares values needs about n log₂ n comparisons in the worst case. On [Three colors: 0, 1 and 2](#example:three-colors) the two are the same thing, since three values in three groups is sorted. One pass of 9 comparisons does it.

The other direction matters more. Quicksort partitions in two, and with many equal values that goes badly: with Lomuto's partition, all values equal gives the same staircase as sorted input (try it on the [quicksort](/quick-sort/) page). A three-way partition puts every value equal to the pivot in the middle, and neither recursive call sees them again. [Every value is the pivot](#example:all-equal) takes one pass: 6 comparisons, no swaps.

```check
Q: After a swap of A[mid] with A[low], why can mid move on without looking at the value that arrived?
- It is below p, like the value that left
* It is a p (A[low..mid − 1] holds only ps), or the same value when low = mid
- high already looked at it
- It cannot: mid must stay, as after a swap with A[high]
= The equal region is A[low..mid − 1], so A[low] is its first p. When that region is empty, low = mid and the swap moves nothing.
```

## The edges

- [Every value above the pivot](#example:all-above): each step swaps A[0] with A[high], so mid never leaves 0. 6 comparisons and 5 swaps, plus a last step that trades A[0] with itself. high ends at −1.
- [A pivot that is not there](#example:pivot-missing): the equal region stays empty and you get a two-way split, 3 2 1 then 9 8 7 6. low = 3 and high = 2, an empty range. That is fine; it means no value equals p.
- At most n − 1 swaps. A step that finds a p swaps nothing, and with no p at all low = mid the whole way, so the last step swaps a value with itself.

## Spot it

Reach for three pointers when the problem says:

- **three kinds**, three colors, three tags, or below, equal and above some value;
- **in place**, "without a second list", O(1) extra space;
- **one pass**;
- and nothing about keeping the order inside a group.

Three problems of our own:

- A list of exam scores and a pass mark m. Put the scores below m first, then the ones of exactly m, then the rest, in place.
- A list of whole numbers. Move the negatives to the front and the positives to the back, with the zeros in between. (p = 0.)
- Each parcel is tagged small, medium or large and has its own address. Group them by tag without a second list. (Counting would lose the addresses.)

Look-alikes: "move the zeros to the end and keep the rest in order" has two kinds and needs the order kept: a write index, as in [two pointers](/two-pointers/). "The numbers 1 to n, one missing" puts each value at its own index: [cyclic sort](/cyclic-sort/). "How many of each" only counts.

## When to use it

Use it for any three-way split around one value, or any three categories, when the order inside a group does not matter. It is also the partition to use inside quicksort when the input has many repeats.

Avoid it when the groups must keep their order: count then rewrite, or any stable partition, at the price of O(n) extra space. And I would not stretch it to four or more kinds. Counting stretches fine.

## Common mistakes

- Moving mid after the swap with A[high]. The value that arrived is unknown, so it gets skipped.
- `while mid < high` instead of `mid ≤ high`. The last unknown value is never looked at.
- Starting high at n instead of n − 1, then reading A[n].
- Expecting the result to be sorted, or stable. It is neither: 7 9 8 came out 8 9 7.
- Counting, then writing the counts back, when the values carry more than their kind.

## Try this

- [Three of each kind around 5](#example:three-kinds): before each step, say which of the three cases it is and whether mid moves.
- Press Compare, pick this page with other options, and set one side to counting then rewriting. Watch `comparisons` and `writes`.
- Load `5 1 5 1 5 1` and partition around 5. Count the swaps first.
- [Every value above the pivot](#example:all-above): why does mid stay at 0 the whole time?
- Switch **Draw values as** to cells, and partition [Three colors: 0, 1 and 2](#example:three-colors) again.
