# Backtracking

Some problems ask for every possibility: every subset of a set, every order of a list, every way to put queens on a board. Backtracking builds them one choice at a time. It makes a choice, explores everything that follows from it, then takes the choice back and tries the next one. Three moves: choose, explore, unchoose.

## Choose, explore, unchoose

One list, `chosen`, holds the partial solution. Every call follows the same shape.

```
search()
  if the choices are complete
    output a copy of chosen
    return
  for each option still open
    chosen.add(option)        choose
    search()                  explore
    chosen.removeLast()       unchoose
```

Each call adds one thing, recurses, and removes what it added, so when a call returns, `chosen` is exactly as its caller left it. That return is the "back" in backtracking. The drawing shows the decision tree, one box per call, with `chosen` and the outputs underneath. [Show me](#play:subsets-three)

## Subsets: take or skip

Each value is a yes-or-no decision. A call decides about one value: first it takes it (choose, explore, unchoose), then it explores without it. The left edge of each box is "+v", taking v; the right edge skips it. After n decisions a leaf outputs what was taken, so the leaves, left to right, are the subsets in the order the search finds them. Written as the list `chosen` holds: [1, 2, 3], [1, 2], [1, 3], [1], [2, 3], [2], [3], [].

n values give 2ⁿ subsets and 2ⁿ⁺¹ − 1 calls: 15 calls for 3 values, 31 for 4. [One value](#example:one-value)

```check
Q: How many calls does the search make to list every subset of 4 values?
- 16
- 24
* 31
- 32
= Each call above the leaves makes two calls, take and skip, so the tree has 16 leaves and 15 calls above them: 31.
```

## Permutations: pick the next value

For orders, a call picks one of the values not used yet, explores, then unchooses it and picks the next. The tree fans out n ways at the top, then n − 1, down to 1, so there are n! leaves. 3 values give 6 orders from 16 calls; 4 values give 24 orders from 65 calls, about e × n! in general. [Show me](#play:permutations-three)

The search tells values apart by position. Give it 1 1 2 and every order comes out twice.

## Pruning

With a target sum, most subsets are not wanted, and a branch can often tell early that it is hopeless. Two checks, at the start of every call: the sum so far is already bigger than the target, or even taking every value left cannot bring it up to the target. Either way the call returns at once, marked "pruned" (just "cut" in the bigger trees, where the boxes are small), and every call it would have made never happens. Those are drawn dashed. Set **Target sum for subsets** to try it. [Subsets with sum 9](#example:target-sum)

The checks rely on every value being positive. With a negative value, a sum that is too big today can come back down later, and the first check throws good branches away.

```check
Q: The values are 4, 5, 6 and 7 and the target is 9. The search has taken 4 and 5 and now takes 6. What happens?
- It outputs [4, 5, 6]
* The call is pruned: the sum is 15, more than 9
- It goes on to decide about 7
= 4 + 5 + 6 = 15 is already over 9, and the values are all positive, so nothing below this call can help.
```

A target out of reach is the extreme case: 1 + 2 + 3 is only 6, so the first call sees that 10 cannot be reached and returns. [One call instead of 15](#example:out-of-reach)

## When to use it, when to avoid it

Use backtracking when you need every solution, or one solution to a puzzle with constraints you can check early: N-Queens, Sudoku, scheduling. The stack only ever holds one path, n + 1 frames, and `chosen` is reused, so the space is small.

The time is not. Listing every subset of 30 values means over a billion outputs, and pruning promises nothing in the worst case. If you only need to count, dynamic programming often does far better: the number of subsets with a given sum can be counted in O(n × target) time. And when you just need the subsets or orders, Python's `itertools.combinations` and `itertools.permutations` already generate them.

## Common mistakes

- Forgetting to unchoose. `chosen` keeps growing, and every later output is wrong.
- Outputting `chosen` itself instead of a copy. The search keeps changing the same list, so every saved output ends up the same.
- Marking a value used and never unmarking it, so later branches cannot pick it.
- Pruning with a test that does not hold for the input, such as the sum test with negative values.

## Try this

- [Every subset of three values](#example:subsets-three). Before each output, say which subset it will be.
- [Every order of three values](#example:permutations-three) and [of four](#example:permutations-four).
- [Subsets with sum 9](#example:target-sum). Count the dashed calls, then set the target to 0 and run it again.
- [A target out of reach](#example:out-of-reach).
- Switch to permutations and type `1 1 2`. Every order appears twice.
