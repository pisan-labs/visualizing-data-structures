# Graph coloring

Color the vertices so that no edge joins two vertices of the same color, and use as few colors as you can. Exam timetables are the classic case: courses are vertices, an edge means some student takes both, and colors are time slots. Finding the fewest colors is hard. Finding *a* coloring is easy, and greedy coloring does it in one pass.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `GREEDY-COLOR(G)` | colors every vertex, in some order | O(V + E) |
| color one vertex v | smallest color its neighbours do not use | O(deg v) |
| Welsh-Powell | greedy, largest degree first | O(V log V + E) |
| DSatur | greedy, most neighbour colors first | O(V² + E) |
| the fewest colors | the chromatic number χ(G) | NP-hard |

Take the vertices one at a time. Give each the smallest color, 1, 2, 3 and so on, that none of its colored neighbours has. That's it. [Show me](#play:one-at-a-time)

Greedy never paints itself into a corner: a vertex with d neighbours sees at most d colors, so color d + 1 is always free. That gives the upper bound. Greedy never needs more than the largest degree + 1 colors.

## How the order changes the answer

Greedy is fast. It is not smart. The same graph can come out with very different counts depending on the order you visit the vertices.

[A bad order](#example:bad-order) is the extreme case. Four pairs, A B, C D, E F and G H, with every vertex joined to everyone except its partner. Two colors are enough: A, C, E, G on one side and B, D, F, H on the other. Name order colors A and B with 1 (they are not joined), then C and D need 2, E and F need 3, G and H need 4. Twice as many as needed. With more pairs it keeps getting worse: n pairs, n colors.

```check
Q: Greedy colors A = 1, B = 1, C = 2. D is joined to A and C. What color does D get?
- 1
- 2
* 3
- 4
= D's colored neighbours use 1 and 2, so the smallest free color is 3.
```

## Better orders: Welsh-Powell and DSatur

**Welsh-Powell** sorts the vertices by degree, largest first. The busy vertices get colored while they still have choices, and the quiet ones fit in at the end. In [Busy vertices first](#example:welsh-powell), name order needs 4 colors and largest degree first needs 3. [Show me](#play:welsh-powell)

**DSatur** (Brélaz, 1979) picks the next vertex as it goes. Each time it takes the uncolored vertex whose neighbours already use the most different colors, its *saturation*. That vertex has the fewest choices left, so deal with it now. Ties go to the larger degree, then name order. On the bad-order graph, [DSatur finds the 2 colors](#example:dsatur-fixes). DSatur always colors a bipartite graph with 2.

Neither is always best. Try the presets and switch the order in the options: sometimes name order wins.

## How good is the answer?

The page checks the count against two bounds at the end:

- A **clique** is a set of vertices all joined to each other. A clique of k vertices needs k colors whatever you do. In [A clique forces the count](#example:clique), A, B, C and D form one, so 4 colors are needed, and greedy used 4. Done: that's optimal.
- **Largest degree + 1** is the most greedy can ever use.

A graph with no odd cycle is **bipartite**, and needs exactly 2 colors (if it has an edge). [An even cycle](#example:even-cycle) alternates 1, 2, 1, 2. [An odd cycle](#example:odd-cycle) can't: the last vertex touches both a 1 and a 2. Its biggest clique is just one edge, so the clique bound says 2 and the truth is 3. The bounds can leave a gap, and closing it is the hard part.

```check
Q: A graph contains 5 vertices that are all joined to each other. What can you say for sure?
- Greedy will use exactly 5 colors
* Every coloring needs at least 5 colors
- The graph needs at most 5 colors
= A clique of 5 needs 5 different colors. The rest of the graph may need more, and a bad order may use more.
```

## When to use it

Greedy coloring is the default for register allocation, scheduling and frequency assignment, where a good-enough answer now beats the best answer next week. Deciding whether 3 colors are enough is NP-complete, so exact answers mean exponential search. For a few dozen vertices that is fine. For thousands it is not.

Avoid trusting a greedy count as "the" answer. It is an upper bound. If it matches a clique you found, you are done. Otherwise you don't know.

## Common mistakes

- Forgetting that the order matters. "Greedy uses 4 colors" means nothing without the order.
- Giving a vertex the next new color instead of the *smallest free* one.
- Thinking a big clique is the only reason a graph needs many colors. The odd cycle has no triangle and still needs 3. There are triangle-free graphs that need any number of colors you like.
- Treating edge directions as meaningful. Coloring only cares which vertices are joined; this page ignores arrows.

## Try this

- [A bad order](#example:bad-order). Before pressing Color, say which color each vertex will get. Then switch to DSatur.
- Load `A-B, B-C, C-D, D-A, A-C` and color it in all three orders. Do they agree?
- Run the Complete graph preset. Why does every order give the same count?
- Find a 6-vertex graph where Welsh-Powell is worse than name order. (They exist. Have a go.)
