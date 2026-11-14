# Combination sum

Which combinations of 7, 3, 5 and 4 add up to 10, if you may use each as often as you like? You could write down every possible list and add each one up. With these four numbers that is 125 calls of a search, for 3 answers. Or sort the numbers first, and stop a branch the moment the next number is too big. That takes 14.

A combination ignores order: [3, 7] and [7, 3] are the same one, and it is listed once, sorted.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| sorted backtracking, each again | choose, explore, unchoose; stop the loop at the first candidate bigger than what is left | about n per call |
| sorted backtracking, each once | the same, from the next candidate on, trying a repeated value once per depth | about n per call |
| every list, then check | every count of every candidate, summed only at the end | Θ(Π (t / cᵢ + 1)) |
| the output itself | each combination copied out | up to t values each |

This is the backtracking of [subsets and permutations](/backtracking/) with two small changes. Each call only tries candidates from where its caller was, so no combination comes out in two orders. And the candidates are sorted, so one comparison can rule out the rest of the loop. [Show me](#play:sort-and-prune)

The **Approach** option switches to the naive way: build every list without looking at the sum, then check it. Both find the same combinations. `calls` counts calls of the search; `naive total` and `pattern total` say what each approach costs on this input.

## How it works

search(start, left) finds the combinations that make up `left`, using candidates from c[start] on:

1. If left is 0, the chosen values are a combination: output them.
2. Otherwise, for each candidate c[i] from c[start] on: if c[i] is more than left, stop the loop. Else choose it, search(i, left − c[i]), and unchoose it.

The search starts with search(0, target). Passing i, not i + 1, is what lets a candidate be used again.

In [Sort, then prune](#example:sort-and-prune) the candidates sort to 3 4 5 7. Each box in the tree shows the candidate it adds and what is then left. Down the left: +3 leaves 7, +3 leaves 4, +3 leaves 1, and +3 again would leave −2. That box is dashed: the call never happens. The loop at 1 stops right there, without trying 4, 5 or 7, because they are bigger still. Back up, +4 on top of 3, 3 leaves 0: [3, 3, 4]. The search finds [3, 3, 4], [3, 7] and [5, 5] with 14 calls, and prunes 9 branches.

```check
Q: The candidates are 2 5 6 9, sorted, and a call has 4 left. Which candidates does its loop try?
- All four
* 2, then it stops at 5
- 2 and 5
- None: 4 is not a candidate
= 2 fits, so it is chosen and explored. 5 is more than 4, so the loop stops, and 6 and 9 are never looked at. That stop is only safe because the list is sorted.
```

## Every list, then check

The naive way decides how many copies of each candidate to take, from as many as could fit (10 / 3 = 3 copies of 3) down to none, and only then adds up the list. [Every list, then check](#example:every-list) makes 4 × 3 × 3 × 2 = 72 lists, and 125 calls in all to build them, to find the same 3 combinations. It cannot stop early: [3, 3, 3] is already 9, but it still tries adding 4, 5 and 7 to it.

Pruning saves the most when most branches lead nowhere. In [Nothing fits](#example:nothing-fits), every candidate is bigger than the target: one call, and the loop stops at once. When many branches are answers, it saves less. In [Many ways to make 5](#example:many-ways), 1, 2 and 3 make 5 in 5 ways, and the search takes 16 calls against 61. Every answer is a path it has to walk. Pruning cuts the branches that lead nowhere; it cannot cut the answers.

## Each once, and repeats

Switch **Each candidate** to once. Now the recursion goes on from i + 1, so each candidate is used at most once. A value typed twice may be used twice, and that brings a new problem. With 1 1 2 2 3 and target 4, the two 1s would each start a branch that finds [1, 3]. The fix is one line: at each depth, skip a candidate equal to the one just tried.

[Repeats skipped](#example:repeats-skipped) finds [1, 1, 2], [1, 3] and [2, 2] with 9 calls, skipping 4 repeats and pruning 3 branches. Skipped boxes say *same*. The naive way, [every subset](#example:every-subset), makes all 2⁵ = 32 subsets, 63 calls, and finds [1, 1, 2] and [1, 3] twice each. It has to keep a set of what it has already output to throw the copies away.

```check
Q: Each candidate once, sorted candidates 1 1 1 2. Which of these is skipped at the top level (start = 0)?
- c[0] = 1
* c[1] = 1 and c[2] = 1
- c[3] = 2
- Nothing: every candidate is tried once
= At the top level, only the first 1 starts a branch. The second and third 1 are still used, deeper down, inside that first branch: [1, 1, 2] comes from there.
```

Once mode can also hit a dead end: a call with something left and no candidates after it. In [Each candidate once](#example:each-once), 2 3 4 6 and target 9, two calls end that way.

## Spot it

Reach for this pattern when the problem says:

- **list every combination, every way, every set**: the answers themselves, not how many;
- **adds up to exactly t** (or a target to fill: an amount, a length, a time);
- **order does not matter**: [3, 7] is the same as [7, 3];
- **use each as often as you like** or **each at most once**, and **may contain duplicates**.

Three problems of our own:

- A shop sells boxes of 3, 5 and 8 pens. List every way to buy exactly 16 pens. (Each again.)
- A bag holds coins, some of the same value. List every different set of them that makes 50 cents. (Each once, repeats skipped.)
- A sheet holds one stamp of each value from 1 to 12 cents. List every set of exactly k stamps worth n cents. (Each once, with one more prune: stop when too few stamps are left.)

Look-alikes: "in how many ways" wants a count, and a table of counts is far faster than listing; see [subset sum](/dp-subset-sum/). "Every order" or "every sequence" wants order to matter: that is [permutations](/backtracking/), where each step may pick any candidate, not only later ones.

## When to use it

Use it when you need the combinations themselves and there are not too many. Sorting costs O(n log n) once, and then every prune saves a whole subtree.

Avoid it when only the number of combinations is asked: listing takes at least as long as there are combinations, and that can be a lot (the numbers 1 to 10, each as often as you like, make 50 in 62,740 ways). Count with dynamic programming instead.

## Common mistakes

- Starting every call's loop at 0. Then [3, 7] and [7, 3] both come out, and so does every other order.
- Pruning without sorting. "c[i] > left: break" is only right if every later candidate is bigger.
- Using `continue` where `break` is meant, or the other way round. A too-big candidate ends the loop; a repeated value only skips one.
- Skipping repeats with `i > 0` instead of `i > start`. That forbids [1, 1, 2], since the second 1 is skipped even inside the first 1's branch.
- Saving `chosen` itself instead of a copy. Every saved combination then changes as the search goes on.

## Try this

- [Sort, then prune](#example:sort-and-prune): before each step, say whether the next box is a call or pruned.
- Load `9 7 3 5 4` and search for 10 again. Does the 9 change the tree?
- [Repeats skipped](#example:repeats-skipped), then switch Each candidate to again. Which combinations appear?
- Press Compare, pick this page with other options, and set one side to every list. Search for 12 and watch `calls`.
- Load `2 4 6 8` and search for 9. Guess the answer before you press Search.
