# Cyclic sort

An array of n numbers, each from 1 to n. Which numbers are missing, and which came twice? You could sort it, or count every number in a second array. There is a cheaper trick, because each value tells you where it goes: the value v belongs in slot v − 1. Swap every value home, and the slots left holding the wrong number give you the answer. No comparisons between values, no second array.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| sort, then scan: cyclic sort | swap each value home, then check each slot | at most n − 1 swaps and 3n − 1 comparisons, O(1) extra space |
| sort, then scan: selection sort | find the smallest for each slot, then scan by value | n(n − 1)/2 + n comparisons, O(1) extra space |
| a count per number | count each value in a second array | O(n) time, O(n) extra space |

The home of v is A[v − 1]. Once a value is home it never moves again, so every swap puts at least one value in place for good. That is where the n − 1 comes from. [Show me](#play:one-missing)

The **Approach** option switches to the naive way: sort with [selection sort](/selection-sort/), then scan. Both report the same missing numbers and repeats. The variables count the work: `comparisons` compares two values (or a value with the number its slot should hold), `swaps` exchanges two different slots, and `naive total` and `pattern total` say what each approach costs on this input.

## How it works

Start with i = 0 and look at v = A[i]. Its home is j = v − 1.

1. If A[j] holds something other than v, swap A[i] and A[j]. v is home. Stay at i: a new value just arrived there.
2. Otherwise move i on. Either v is home already (i = j), or its home holds another copy of v, so this one is a repeat with nowhere to go.

Then scan: for each i, if A[i] ≠ i + 1, the number i + 1 is missing and the value in A[i] is a repeat.

In [One repeated, one missing](#example:one-missing), A = 6 4 1 8 4 2 7 3. i stays at 0 for five swaps. 6 goes to A[5] and brings back 2, 2 goes to A[1] and brings back 4, then 4, 8 and 3 go home in turn, and the 1 that arrives last is home too. Later the 4 in A[4] finds a 4 already in A[3]: a repeat. 13 comparisons and 5 swaps, then the scan stops on A[4] = 4, not 5. Missing 5, repeated 4.

```check
Q: A = 3 1 2. How many swaps does cyclic sort make?
- 1
* 2
- 3
- 0
= 3 goes to A[2] and brings back 2; 2 goes to A[1] and brings back 1, which is home already. Three values in one cycle take two swaps.
```

## Cycles

Why the name? Follow the values: A[0] holds 6, whose home A[5] holds 2, whose home A[1] holds 4, and so on until you get back to slot 0. A permutation splits into cycles like that, and a cycle of k values takes k − 1 swaps: each swap sends one value home, and the last one sends two.

[One long cycle: n − 1 swaps](#example:one-long-cycle) is the worst case, 2 3 4 5 6 7 1, a single cycle through all 7 slots: 6 swaps, all at i = 0. [Two cycles, and a value already home](#example:two-cycles) has cycles of 2 and 3 and a 6 at home: 1 + 2 = 3 swaps. For any arrangement of 1 to n, that is n minus the number of cycles, the fewest swaps that can sort it. [Every value already home](#example:already-home) is the best case: 6 comparisons, no swaps.

## The scan

After the swaps, every value that is present sits at home. The repeats fill whatever slots are left, and those are exactly the homes of the missing numbers. So one pass reads off both: [Many repeats, many missing](#example:many-repeats) ends 1 2 5 5 5 1, and the slots for 3, 4 and 6 hold 5, 5 and 1.

```check
Q: After cyclic sort, A = 1 4 3 4 5. What is missing, and what is repeated?
* 2 is missing, 4 is repeated
- 4 is missing, 2 is repeated
- Nothing is missing
- 2 and 4 are missing
= A[1] should hold 2 and holds 4 instead. Every other slot holds its own number, so 2 is the one missing and that 4 is the extra copy.
```

## Against sorting first

Selection sort also puts one value in its final place per swap, at most n − 1 swaps. The difference is finding it. Selection sort searches the rest of the array for the smallest value; cyclic sort reads the home off the value. [Selection sort first, then a scan](#example:sort-first) takes 28 comparisons to sort the 8 values, plus 8 for the scan and 6 swaps: 42, against 26. [Show me](#play:sort-first)

The scan has to change too. In a sorted array a repeat can push the values after it off their slots: 1 1 2 3 is sorted, 4 is missing, and yet A[1], A[2] and A[3] all hold the wrong number. So the naive scan keeps the value it expects next instead of trusting the index.

Any sort that compares values needs about n log₂ n comparisons in the worst case. Cyclic sort gets under that the way [counting sort](/counting-sort/) does: it uses a value as an index, which a comparison sort may not.

Is it always cheaper here? Nope. On 2 3 4 1, one cycle of 4, cyclic sort and its scan take 14 to selection sort's 13, and 4 3 2 1 is a tie at 12. Cyclic sort and its scan cost at most 4n − 2; selection sort and its scan cost at least n(n − 1)/2 + n. From 7 values on, those bounds alone settle it, and the gap grows with n².

## Spot it

Reach for cyclic sort when the problem says:

- **the numbers 1 to n** (or 0 to n − 1), in a list of about n: every value has a slot of its own;
- **missing, repeated, duplicate**, "the smallest one not there";
- **O(1) extra space**, or "without a second array";
- and the list may be changed.

Three problems of our own:

- Raffle tickets numbered 1 to n were sold and n stubs came back, but one number came back twice. Which never came back?
- Each of n students writes a seat number from 1 to n on a card, and some write the same number. Which numbers were written more than once? Use only a few variables beyond the cards.
- A box holds n slips: raffle ticket numbers, and junk such as zeros, negatives and numbers bigger than n. What is the lowest positive number not in the box? (Only 1 to n + 1 can be the answer: swap 1 to n home, leave the rest where they are, and the first slot without its own number is the answer, or n + 1 if every slot has it.)

Look-alikes: "the list is read-only and exactly one of 0 to n is missing" cannot be swapped; add the values up and subtract from n(n + 1)/2, or XOR them. "Group the values below m first" is a partition: [Dutch national flag](/dutch-flag/). "How often does each word appear" has no slots, so count in a hash map.

## When to use it

Use it when the values are, or can be turned into, indices: 1 to n, 0 to n − 1, or 1 to n with the out-of-range values left where they are. It runs in O(n) with O(1) extra space and, as a bonus, leaves every value that is present in its sorted place.

Avoid it when the array must not change, when the values are not small whole numbers in a known range, or when you need the repeats in their original order. A boolean array of n flags is simpler and also O(n), if O(n) extra space is fine.

## Common mistakes

- Moving i on after a swap. The value that arrived at A[i] has not been placed yet.
- Testing A[i] ≠ i + 1 as the swap condition. With a repeat whose home is taken, that swaps two equal values forever. Test A[i] ≠ A[j].
- In Python, `a[i], a[a[i] - 1] = a[a[i] - 1], a[i]`. The left side assigns a[i] first, so a[a[i] - 1] then reads the new a[i]. Compute j = a[i] − 1 first.
- Scanning a sorted array by index for the missing numbers. Only cyclic sort's result can be read that way.
- Forgetting values outside 1 to n. A 0 or an n + 1 has no home, and A[v − 1] reads outside the array.

## Try this

- [One repeated, one missing](#example:one-missing): before each swap, say which value arrives at A[0].
- Press Compare, pick this page with other options, and set one side to selection sort. Use the preset **One long cycle** at 12 values and watch `comparisons`.
- Load `4 3 2 1`. How many swaps? Then load `2 1 4 3` and compare.
- [Many repeats, many missing](#example:many-repeats): which 5 counts as the repeat? Does it matter?
- Load `2 3 4 1` with each approach. Which wins at 4 values?
