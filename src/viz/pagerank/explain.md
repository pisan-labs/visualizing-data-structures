# PageRank

How important is a web page? Counting the links into it is a start, but a link from a page nobody visits shouldn't count as much as a link from a page everybody visits. PageRank makes that circular idea work: a page is important if important pages link to it. Brin and Page built Google on it in 1998. The math is a random surfer and a loop.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| one iteration | every page shares its rank among its links | Θ(V + E) |
| `PAGERANK(G, d)` | iterate until the ranks stop moving | Θ(V + E) per iteration |
| iterations to tolerance ε | the error shrinks by about d each time | about log(1/ε) / log(1/d) |

Picture a surfer clicking links at random. With probability d (0.85 here) they click a link on the current page. Otherwise they get bored and jump to any page at all. PageRank is the fraction of time the surfer spends on each page in the long run. [Show me](#play:few-pages)

## How it works

Every page starts with rank 1/N. Then, over and over:

PR′(v) = (1 − d)/N + d · Σ PR(u)/out(u), over the pages u that link to v

The first part is the random jump: everybody gets a small equal share. The second part is the links: each page u splits its rank evenly among the pages it links to. Stop when the ranks change by less than 0.001 in total.

In [Rank flows along the links](#example:few-pages), C has three links in and A has three too. A still ends up on top, because C sends A all of its rank while A splits its own between B and C. Seven iterations. The bars under the graph keep one scale for the whole run, so you can watch rank drain from some pages into others.

```check
Q: Page u has rank 0.3 and links to three pages. With d = 0.85, how much does each of those pages get from u?
- 0.3
- 0.1
* 0.085
- 0.255
= u splits 0.3 three ways (0.1 each), and the links carry a fraction d of it: 0.85 × 0.1 = 0.085.
```

## Dangling pages

A page with no links out is *dangling*. Where does its rank go? If nowhere, it leaks out of the system every iteration and the total drops below 1: [Dangling rank that leaks away](#example:dangling-drop) ends with the ranks adding up to 0.431. The usual fix, the default here, treats a dangling page as linking to every page, so its rank is spread evenly. Switch the option and compare.

## Why d matters

Without the random jump (d = 1) two things go wrong. Rank can get stuck going round a cycle forever: in [d = 1: no random jump](#example:no-jump), the ranks never settle and the run gives up after 100 iterations. And pages that link only to each other soak up everything. [A rank trap](#example:trap) shows it even with d = 0.85: E and F link only to each other and end up with about 70% of the rank between them. The jump is what keeps the rest alive.

Smaller d converges faster but trusts the links less. At d = 0.5 the jump dominates and the ranks stay closer to equal. 0.85 is the compromise in the original paper, and nobody has found a reason to argue much.

```check
Q: Why does PageRank include the random jump with probability 1 − d?
- To make the computation faster on a single iteration
* So rank cannot get trapped in cycles or link-only groups, and the iteration converges
- To give dangling pages more rank
= With the jump, every page can reach every other, which guarantees one answer and convergence. Without it, rank can slosh around a cycle or pile up in a trap.
```

## When to use it

PageRank works for any "who matters in this network" question where links mean endorsement: citations between papers, follows on social networks, calls between functions, even which team beat which. [Many links in beats many links out](#example:hub): H is linked from everyone and gets the top rank, and A gets second place for being H's only link.

It is not a measure of quality or relevance to a query. Search engines mix it with many other signals. And it can be gamed: a farm of pages all linking to one page inflates its rank, which is roughly what the trap example does on purpose.

## Common mistakes

- Forgetting to divide by out-degree. A page with 100 links passes 1/100 of its rank along each.
- Ignoring dangling pages. The ranks quietly stop adding up to 1.
- Expecting d = 1 to give the "pure" answer. It may not converge at all, and on many graphs the answer isn't unique.
- Running until the change is exactly 0. Floating point never quite gets there; use a tolerance.
- Treating rank as votes counted once. It is a fixed point: everyone's rank depends on everyone else's.

## Try this

- [A ring](#example:ring): why is 1/N already the answer?
- [Rank flows along the links](#example:few-pages): add `F>C` so F is no longer dangling. Who gains?
- Run [the trap](#example:trap) with d = 0.5 and with d = 0.95. What happens to E and F? Why does 0.95 run out of iterations?
- Load an undirected star, such as the Star preset. Who wins, and by how much?
