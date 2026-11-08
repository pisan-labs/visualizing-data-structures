# Fisher-Yates shuffle

You want to shuffle an array so that every order is equally likely: a card game, a random sample, a quiz with the questions in random order. The right way is short, runs in O(n), and is easy to get subtly wrong. The wrong way looks almost the same and passes every test you are likely to write.

```
for i = 0 to n − 2
  j = RANDOM(i, n − 1)
  swap A[i] with A[j]
```

That's it. Fisher and Yates described it with pencil and paper in 1938; Durstenfeld wrote the in-place computer version in 1964, and Knuth made it famous. CLRS calls it RANDOMIZE-IN-PLACE.

| | Cost |
|---|---|
| Time | O(n): n − 1 random picks and swaps |
| Extra memory | O(1): it shuffles in place |

## How it works

Think of the array as two parts: a shuffled part on the left, which starts empty, and an unshuffled part on the right, outlined in the drawing. Each step picks one item at random from the unshuffled part and swaps it into position i. That item is now final, and the unshuffled part shrinks by one. [Show me](#play:one-shuffle)

j can be i itself. That is not a wasted step: without it, the item at position i could never stay where it is, and some orders would be impossible.

Why is it fair? Position 0 gets each of the n items with probability 1/n. Position 1 gets each of the remaining n − 1 with probability 1/(n − 1). And so on. That is n · (n − 1) · … · 1 = n! equally likely runs, one for each of the n! orders.

```check
Q: Fisher-Yates is shuffling 6 items. At i = 2, how many positions can j be?
- 6
* 4
- 3
- 2
= j comes from the unshuffled part, positions 2 to 5, i itself included: 4 choices.
```

## Left to right or right to left

CLRS goes left to right, picking j from i to n − 1. Most libraries (Java's `Collections.shuffle`, Python's `random.shuffle`) go right to left, picking j from 0 to i, so the unshuffled part shrinks from the right. Same idea, mirrored. Set **Direction** to compare. [Right to left](#example:right-to-left)

## The naive shuffle is biased

Here is the tempting version: for every position i, swap with any position j from 0 to n − 1.

```
for i = 0 to n − 1
  j = RANDOM(0, n − 1)      // the bug
  swap A[i] with A[j]
```

Every run looks random. It isn't fair. There are nⁿ equally likely sequences of picks, and n! orders. For n = 3 that is 27 runs over 6 orders, and 27 is not a multiple of 6, so the orders cannot all get the same share. Counting them all: 1 3 2, 2 1 3 and 2 3 1 get 5 runs each, the other three get 4.

Set **Swap with** to any position, type 6000 and press **Run trials**. The bars for the favored orders stand out above the dashed line, the count you would expect if every order were equally likely. [The naive shuffle is biased](#play:naive-bias) Then do the same with Fisher-Yates: [every bar near 1000](#example:even-counts).

```check
Q: Why can the naive shuffle of 4 items never be fair?
- It makes too few swaps
- It can swap an item with itself
* 4⁴ = 256 equally likely runs cannot be split evenly among 4! = 24 orders
- Random numbers repeat
= 256 / 24 is not a whole number, so some orders must get more runs than others. The same holds for every n > 2.
```

## When to use it, and common mistakes

Use it whenever you need a random order: shuffling, random sampling without replacement (stop after k steps and take the first k items), randomized algorithms like quicksort with a random pivot order. Use your library's shuffle when you can; it is this algorithm.

Common mistakes:

- Swapping with any position, as above.
- Picking j from i + 1 to n − 1 instead of i to n − 1. That is Sattolo's algorithm, which only makes cycles: no item ever stays put.
- `rand() % n`. Unless the generator's range is a multiple of n, the low numbers come up a little more often. Small, but it is bias.
- Sorting by a random key with a comparator that returns random answers (`sort((a, b) => Math.random() - 0.5)`). Biased, and some sort implementations do not even promise to finish.
- A weak random generator. A 52-card deck has 52! ≈ 2²²⁶ orders. A generator with a 32-bit seed can produce at most 2³² of them.

## Try this

- Load A B C D E F and shuffle. Watch the unshuffled outline shrink.
- Run 6000 trials with each setting. Which orders does the naive shuffle favor?
- Run only 60 trials of the correct shuffle. Do the bars look even? How many trials until they do?
- Shuffle two items with the naive version. Is it biased? Why not?
