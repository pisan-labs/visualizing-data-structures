# NP-completeness reductions

Nobody knows a fast algorithm for 3-SAT. Nobody knows one for CLIQUE, VERTEX-COVER or the traveling salesperson either. That would be a coincidence, except it isn't: they are all the same problem in disguise. A reduction is the disguise. It translates any instance of one problem into an instance of another, quickly, so that the answer stays the same.

## The idea

A reduction from A to B, written A ≤p B, is a polynomial-time algorithm that turns an instance x of A into an instance y of B, with

x is a yes-instance of A exactly when y is a yes-instance of B.

So if B had a fast algorithm, A would too: translate, then solve. Read the arrow as "B is at least as hard as A".

Cook and Levin showed in the early 1970s that SAT is NP-complete: every problem in NP reduces to it. After that, showing a new problem B is NP-complete takes two steps: B is in NP (a yes-answer has a certificate you can check quickly), and some known NP-complete problem reduces to B. Karp did this for 21 problems in 1972, and the map on this page is a small piece of that family tree.

On the map, the solid arrows can be stepped through here; the dashed ones are there for orientation. [Show me](#play:triangles)

| Reduction | The new instance | Cost |
|---|---|---|
| 3-SAT → IND-SET | a triangle per clause, x joined to ¬x, k = clauses | O(m²) |
| IND-SET → V-COVER | the same graph, k' = n - k | O(n + e) |
| IND-SET → CLIQUE | the complement graph, the same k | O(n²) |
| CLIQUE → V-COVER | the complement, k' = n - k | O(n²) |
| V-COVER → SET-COVER | an element per edge, a set per vertex | O(n · e) as written |

Here m is the number of clauses, n the number of vertices and e the number of edges.

## 3-SAT to INDEPENDENT-SET

Make one vertex per literal in each clause, and join the vertices of a clause into a triangle. Then join every x to every ¬x in another clause. Ask for an independent set of size k = m, the number of clauses.

Why does it work? The triangle means an independent set takes at most one vertex per clause, so to reach size m it takes exactly one: a literal to make true in each clause. The x to ¬x edges mean it never picks a literal and its opposite, so those choices fit together into one assignment. Going the other way, a satisfying assignment has a true literal in every clause, and picking one per triangle gives an independent set of size m. [A triangle per clause](#example:triangles)

Notice what the reduction does not do. It never tries an assignment. It reads the formula and writes a graph, with at most 3m vertices. The brute-force check at the end is only there so you can see the answer carry across, and it is the slow part. (Turn it off under **Options** to see the reduction alone.)

```check
Q: A 3-SAT formula has 4 clauses of 3 literals each. The reduction asks for an independent set of what size?
- 3
* 4
- 12
= k is the number of clauses: one vertex, one true literal, per triangle.
```

## No maps to no

Half of the correctness argument is easy to forget. A reduction must also send every no-instance to a no-instance. If it only got the yes-answers right, a reduction that always outputs "a graph with no edges, k = 1" would "work".

(a), (¬a ∨ b), (¬b ∨ c), (¬c) is unsatisfiable: a forces b, b forces c, and the last clause wants not c. Its graph is a path of 6 vertices, and the largest independent set has 3, short of the 4 we asked for. [Show me](#play:unsat)

## Complements and n - k

The graph reductions are short. A set S is independent exactly when every edge has an end outside S, so V - S is a vertex cover: an independent set of size k is a vertex cover of size n - k. [Asking for too much](#example:no-cover) shows a no going across.

Flip every pair (joined becomes not joined) and an independent set becomes a clique: [independent set to clique](#example:complement). CLRS goes 3-SAT → CLIQUE → VERTEX-COVER, and the second step is the complement plus n - k: [clique to vertex cover](#example:clique-route).

VERTEX-COVER to SET-COVER makes each edge an element and each vertex the set of edges it touches. Picking k sets that cover everything is picking k vertices that touch every edge. Run [the whole chain](#play:chain) and the certificate travels from an assignment all the way to a choice of sets.

```check
Q: A graph has 7 vertices. You reduce "is there an independent set of size 3?" to VERTEX-COVER. What k does the new question ask for?
- 3
- 7
* 4
= The cover is everything outside the independent set: n - k = 7 - 3 = 4.
```

## When reductions help, and when they don't

Reductions are how you show a problem is hard, so you can stop looking for an exact fast algorithm and look at approximations, special cases or heuristics instead. They also work in the friendly direction: people reduce scheduling and configuration problems to SAT on purpose, because SAT solvers are very good in practice.

What a reduction does not carry over is anything about approximate answers. VERTEX-COVER has a simple algorithm that is never worse than twice the best. INDEPENDENT-SET, its mirror image under n - k, has no good approximation known, and under standard assumptions none exists. A cover twice too big says almost nothing about the independent set left over.

And NP-complete is about the worst case. Plenty of instances are easy. The 3-SAT formulas on this page take a few dozen tries.

## Common mistakes

- Reducing the wrong way. To show B is hard, reduce a known hard problem to B, not B to it. Reducing B to SAT only shows B is no harder than SAT.
- Checking only that yes maps to yes.
- Letting the reduction solve the problem. If building the instance needs the answer, it is not a polynomial-time reduction.
- Making the new instance exponentially big. A reduction that writes out all 2ⁿ assignments is not polynomial even if each step is quick.
- Forgetting to change k. IND-SET → V-COVER keeps the graph, but k becomes n - k.

## Try this

- [A triangle per clause](#example:triangles). Before the check runs, find an independent set of size 3 by eye.
- [No maps to no](#example:unsat). Why is the largest independent set exactly 3?
- [From 3-SAT to SET-COVER](#example:chain). Follow one vertex of the certificate through all three steps.
- [Solving it the slow way](#example:brute-force): brute force on its best case, then a reduction that reuses what it found.
- Load your own graph, such as `A-B, B-C, C-D, D-E, E-A k=2`, and press **To CLIQUE**. What does the complement of a 5-cycle look like?
