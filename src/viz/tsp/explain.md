# Traveling salesperson: exact vs approximate

You have seven cities to visit, one trip, and you want to be home by dinner. Visit every city once, come back to where you started, and drive as little as possible. That is the traveling salesperson problem (TSP). It is easy to state, and nobody knows a fast way to solve it exactly. So this page does two things: it finds the best tour the slow way, and it shows how close the fast ways get.

## The idea

| Method | What it finds | Cost |
|---|---|---|
| Trying every tour | the best tour | Θ(n!) |
| Held-Karp | the best tour | Θ(2ⁿ n²) time, Θ(2ⁿ n) memory |
| Tree walk (APPROX-TSP-TOUR) | a tour at most 2 × the best, with the triangle inequality | Θ(n²) |
| Nearest neighbour | some tour, no promise | Θ(n²) |
| 2-opt | a better tour than the one you give it | O(n²) per pass |

A tour starts at the first city, here A. With A fixed, there are (n − 1)!/2 different tours (each one can be driven in two directions). Seven cities give 360. Eight give 2520. Twenty give about 6 × 10¹⁶, and that is where trying every tour stops being an option.

The cities on this page are points in the plane, and the distance between two cities is the straight line between them, rounded up. You can also type a complete graph, such as `A-B:5, A-C:4, B-C:3`, if you want distances that are not straight lines.

Every run ends the same way: the tour, its length, the length of the best tour, and the ratio between them. A ratio of 1 means the method found a best tour. [Show me](#play:tree-walk)

## The exact answer: Held-Karp

Held-Karp is dynamic programming over subsets. Fix the start A. For a set S of the other cities and a city j in S, let C(S, j) be the length of the shortest path that leaves A, visits every city in S exactly once, and ends at j.

A set of one city is easy: C({B}, B) = d(A, B). For a bigger set, the path to j came from some other city k in S, after visiting everything else in S. So

C(S, j) = min over k in S − {j} of C(S − {j}, k) + d(k, j).

Each entry needs only entries for sets one smaller, so fill the table by set size. At the end, add the trip home: the best tour is the smallest C(all, j) + d(j, A). Follow the choices back and you have the tour.

Choose **Held-Karp** in the options and have a look at [Held-Karp fills its table](#example:exact-table). With five cities, the four cities other than A make 15 sets, and the table has 32 real entries. Each column is a set, each row an end city, and a dash means the end city is not in the set. [Show me](#play:exact-table)

That is Θ(2ⁿ n²): about 2ⁿ n entries, each a minimum over up to n choices. Exponential, but far better than n!. [Held-Karp on eight cities](#example:eight-cities) fills 448 entries instead of trying 2520 tours. The gap gets silly fast. At twenty cities it is about 10⁷ entries against 6 × 10¹⁶ tours. The page draws the table only up to five cities, because nobody wants to scroll through 448 cells.

```check
Q: C({B, C}, C) is the shortest path from A through B and C, ending at C. Which entries does it need?
- C({B, C}, B) and d(B, C)
* C({B}, B) and d(B, C)
- C({C}, C) and d(A, C)
= The path ends at C, so just before C it was at B, after visiting {B}. C({B, C}, C) = C({B}, B) + d(B, C), the only choice when the set has two cities.
```

## The tree walk: twice the tree

CLRS's APPROX-TSP-TOUR starts from a simple observation. Take the best tour and delete any one edge. What is left is a path through every city, which is a spanning tree. So a minimum spanning tree weighs no more than the best tour.

Now walk around that tree: start at A, go down to each child, and come back up, like tracing the outline of the tree with a pencil. That walk visits every city and uses every tree edge twice, so it costs exactly 2 × the tree, which is at most 2 × the best tour. It is not a tour yet, because it visits cities more than once. So skip any city you have already seen and go straight to the next new one. That shortcut is never longer than the way round, as long as the distances obey the triangle inequality: d(a, c) ≤ d(a, b) + d(b, c). Straight lines do.

The cities in the order the walk first meets them are a preorder walk of the tree. In [Twice around the tree, with shortcuts](#example:tree-walk), the tree weighs 215, the walk costs 430, and the shortcuts bring the tour down to 310. The best tour is 275, so the ratio is 1.13. The walk row under the drawing fades the cities that the shortcuts skip.

Why round the distances up? Rounding to the nearest whole number can break the triangle inequality by a little, and then the proof breaks too. Rounding up keeps it, because ⌈x + y⌉ ≤ ⌈x⌉ + ⌈y⌉. A small thing, but the guarantee depends on it.

## Nearest neighbour

Nearest neighbour does what most of us would do on a road trip: from where you are, go to the closest city you have not visited. Repeat until you run out, then go home.

It is fast and often decent. It also has no idea what is coming. In [Nearest neighbour paints itself into a corner](#example:nearest-trap), each move looks sensible, and the cities left at the end are scattered, so the last few legs are long. The tour is 276 against a best of 192: 44% longer. On worse inputs it can be about log n times the best, so there is no constant factor like the tree walk's 2.

On [cities on a circle](#example:on-a-circle) it finds the best tour, because the closest city is always the next one round. Easy cases make every method look good.

```check
Q: Why does the tree walk come with a factor-2 guarantee and nearest neighbour does not?
- The tree walk looks at more distances
* The tree is a lower bound on the best tour, and the walk costs at most twice the tree
- Nearest neighbour does not use the triangle inequality
= A minimum spanning tree weighs no more than the best tour, and the walk with shortcuts costs at most twice the tree. Nearest neighbour never compares its tour with anything, so nothing bounds it.
```

## 2-opt: fixing the tour you have

Turn on **Improve the tour with 2-opt**. 2-opt takes two edges of the tour, a-b and c-d, and replaces them with a-c and b-d. The piece of the tour between b and c now runs backwards. If that is shorter, keep it. Repeat until no swap of two edges helps.

A tour that crosses itself can always be shortened this way: undo the crossing. In [2-opt untangles a crossing](#example:two-opt-fix), nearest neighbour gives 310 and two swaps bring it to 275, the best tour. [Show me](#play:two-opt-fix)

2-opt stops at a local optimum: no single swap helps. That is not always the best tour. In practice, 2-opt (and its bigger cousins, 3-opt and Lin-Kernighan) is how real TSP solvers get very close, very fast.

## When the triangle inequality fails

The factor 2 is not free. It needs the triangle inequality, and the proof uses it exactly once: for the shortcuts.

[No triangle inequality, no guarantee](#example:not-metric) has distances where going A-C-B costs 3 and the edge A-B costs 60. The tree walk ends with a tour of 120 against a best of 7: a ratio of 17. Nothing is wrong with the code. The guarantee just does not apply.

It is worse than that. Without the triangle inequality, no fast algorithm can promise any constant factor at all, unless P = NP. With it, Christofides' algorithm promises 1.5, and that stood as the best known bound for over 40 years.

## When to use what

- A handful of cities, say up to 15 to 20: Held-Karp. You get the best tour, and you know it is the best.
- More cities, and you need a promise: the tree walk, or Christofides if you have a matching algorithm handy.
- More cities, and you need a good tour now: nearest neighbour or the tree walk, then 2-opt.
- Thousands of cities and a serious budget: a real solver such as Concorde, which uses linear programming and has solved tours of tens of thousands of cities exactly.

## Common mistakes

- Counting tours as n!. With the start fixed and both directions the same, there are (n − 1)!/2.
- Forgetting the trip home. A tour is a cycle; nearest neighbour's last edge back to A is often its worst one.
- Assuming the factor 2 holds for any distances. It needs the triangle inequality.
- Rounding distances to the nearest whole number and then trusting the proof.
- Thinking 2-opt finds the best tour. It finds a tour no single swap can improve.

## Try this

- [Twice around the tree](#example:tree-walk). Before each step of the walk, say which city joins the tour next.
- Load the same seven cities and switch to nearest neighbour. Is it better or worse than the tree walk? Then turn on 2-opt.
- Load `A(0,0) B(10,0) C(10,10) D(0,10)` and run every method. Can any of them miss?
- [The bad case for the tree walk](#example:tree-trap): find the shortcut that costs the most.
- Change one distance in [No triangle inequality](#example:not-metric) so the triangle inequality holds again. What happens to the ratio?
