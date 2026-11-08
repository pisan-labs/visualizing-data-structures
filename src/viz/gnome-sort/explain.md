# Gnome sort

Dick Grune named it after the way a Dutch garden gnome sorts a line of flower pots. The gnome looks at the pot next to him and the one before it. If they are in the right order, he steps forward. If not, he swaps them and steps back. When he walks off the end, the pots are sorted. That is the whole algorithm: one loop, one index, no nested loops in sight.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `sort(A)` | Sorts A in place | O(n) best, O(n²) average and worst |

```
pos = 0
while pos < n
  if pos == 0 or A[pos - 1] <= A[pos]: pos = pos + 1
  else: swap A[pos - 1] and A[pos]; pos = pos - 1
```

At the front there is nothing to compare with, so the gnome steps forward. The arrow is pos; the gray band is everything left of it. [One gnome, one index](#example:walk) [Show me](#play:walk)

## It is insertion sort in disguise

Here is the trick. Everything left of pos is always sorted. Stepping forward past a pair in order keeps it sorted. A swap and a step back carry a value left, one slot at a time, until it is no smaller than its left neighbor. That is insertion: the new value walks into its place in the sorted part.

So gnome sort makes exactly the swaps insertion sort (the swap version) makes: one per out-of-order pair. The difference is what happens after. Insertion sort's outer loop jumps straight to the next new value. The gnome has no outer loop, so he walks forward over the sorted part, comparing every pair again, until he reaches new ground.

In [A small value walks home](#example:walk-back), 5 starts at the end. Five swaps carry it to the front. Then the gnome walks back past 20, 30, 40 and 50, finding each pair in order: 14 comparisons in all. Insertion sort makes 9. [Show me](#play:walk-back)

```check
Q: Gnome sort and insertion sort (with swaps) sort the same array. What is the same?
* The number of swaps
- The number of comparisons
- Both the swaps and the comparisons
- Neither
= Both make one swap per out-of-order pair. The gnome also walks forward again over the sorted part, which costs extra comparisons.
```

## Jumping back

Give the gnome a memory and the walk goes away. Turn on **Jump back to where the gnome left off**: a second variable, far, remembers the farthest he has been. When he finds a pair in order, he jumps to far + 1 instead of stepping forward. [Jump back](#example:jump) runs the same values: 9 comparisons, the same as insertion sort. At that point it is insertion sort, written with one loop.

## Costs

- **Best case**, sorted input: he walks straight to the end. n - 1 comparisons, no swaps, O(n). [Sorted input](#example:sorted)
- **Worst case**, reverse order: every new value is the smallest yet and walks all the way to the front. n(n - 1)/2 swaps, and the walk forward about doubles the comparisons. O(n²). [Reverse sorted](#example:reverse)
- **Average**: about n²/4 swaps. O(n²).

It sorts in place with O(1) extra space. It is stable: the gnome swaps only when the left pot is strictly bigger, so equal values never pass each other. [Equal values stay in order](#example:duplicates)

```check
Q: A has 6 values in reverse order. How many swaps does gnome sort make?
- 6
- 5
* 15
- 36
= Every pair is out of order, and each swap fixes one pair: 6 × 5 / 2 = 15.
```

## When to use it

Nope, not in real code. Insertion sort does the same swaps with fewer comparisons, and your language's sort beats both. Gnome sort is here because it is the smallest sorting program I know of, and because it shows that insertion sort does not need two loops. It also makes a good exam question: "what does this loop do?"

## Common mistakes

- Forgetting `pos == 0`. Without it, the gnome compares `A[-1]` and walks off the front.
- Using `<` instead of `<=` in the test. Equal neighbors then swap back and forth forever.
- Thinking it is a new O(n log n) algorithm because it has one loop. One loop, but pos can go back n times.
- Updating far when stepping back in the jump version. far only moves forward.

## Try this

- [One gnome, one index](#example:walk). Before each step, say whether he goes forward or back.
- [A small value walks home](#example:walk-back), then [Jump back](#example:jump). Count the steps saved.
- Load the preset **Small value at the end** at size 20, with and without jumping.
- Write gnome sort from memory. It is five lines.
