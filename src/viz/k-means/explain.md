# k-means clustering

You have a pile of points and a hunch that they fall into groups. k-means finds k groups by alternating two simple steps: give every point to its nearest centre, then move every centre to the middle of its points. Repeat until nothing changes. Stuart Lloyd described it at Bell Labs in 1957 (published 1982), which is why the loop is called Lloyd's algorithm.

It shows up all over AI. Vector databases use it to split millions of embeddings into cells, so a search only looks in a few of them. Product quantization uses it to compress vectors. The points here are in two dimensions so you can watch; real embeddings have hundreds.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| seed | pick k starting centres | Θ(k) random, Θ(N·k) k-means++ |
| assign | every point joins its nearest centre | Θ(N·k) distances |
| update | every centre moves to the mean of its points | Θ(N + k) |
| run | assign and update until an assignment changes nothing | Θ(I·N·k) for I rounds |

N is the number of points. Distances are squared Euclidean distances, d² = (x₁ − x₂)² + (y₁ − y₂)², because the square root changes nothing about which centre is nearest. A tie goes to the centre with the lower number. [Show me](#play:three-groups)

## How it works

[Centres placed by hand](#example:by-hand) is the textbook exercise. Six points, two centres, c1 at (1, 1) and c2 at (2, 1), both in the bottom left. Badly placed, on purpose.

Round 1. B(2, 1) sits on c2. D, E and F are far from both centres, but a little closer to c2 (D is 18 from c2 and 25 from c1). So c2 gets B, D, E and F, and c1 gets A and C. Then c2 moves to the mean of its four points: x = (2 + 5 + 6 + 7) / 4 = 5, y = (1 + 4 + 5 + 5) / 4 = 3.75. One update and c2 has jumped most of the way to the group on the right.

Round 2. Now B is 2 from c1 and 16.56 from c2, so B switches. Round 3 changes nothing, and we are done: c1 at (1.33, 1.67) with A, B and C, c2 at (6, 4.67) with the rest.

```check
Q: The centres are c1 = (0, 0) and c2 = (4, 0). Which centre does the point (3, 1) join?
- c1, because it is closer to the origin
* c2
- Neither: it is a tie
= d² to c1 is 3² + 1² = 10, and d² to c2 is 1² + 1² = 2. c2 is nearer.
```

The assignment step splits the plane into one region per centre, everything nearer to that centre than to any other: a Voronoi diagram, the dual of the [Delaunay triangulation](/delaunay/). Finding each point's nearest centre is a nearest-neighbour search, which a [k-d tree](/kd-tree/) can speed up when k is large.

## Why it stops

Watch the WCSS in the variables: the within-cluster sum of squares, the total d² from every point to its own centre. In the hand example it goes 95, 26.75, 12.19, 6. It never goes up, and the reason is short. The assignment step can only lower it, since each point moves to a centre at least as close. The update step can only lower it, since the mean is the one spot with the least total squared distance to a group of points. There are finitely many ways to split N points into k groups, and WCSS keeps falling, so the loop has to end.

It ends somewhere. Not necessarily at the best answer.

## Seeding

Where you start decides where you end. [A bad start that never recovers](#example:bad-start) picks three random points as centres: B, C and I. Two of them are in the same group at the bottom left, and the third has to cover the other two groups by itself. Lloyd's algorithm converges in 2 rounds to WCSS 63.50. The good answer has 9.33. The two bottom-left centres share that group, and no point on the right is ever nearer to either of them than to the third centre, so neither one ever moves over.

k-means++ (Arthur and Vassilvitskii, 2007) fixes most of this with one idea: pick the first centre at random, then pick each next centre with probability proportional to D², the squared distance to the nearest centre chosen so far. Far points are likely; a point already chosen has D² = 0 and can't be picked again. In [k-means++ spreads the centres](#example:plus-spreads) the draws land on F, C and H, one per group, and the run converges in 2 rounds. Arthur and Vassilvitskii proved the result is within a factor of O(log k) of the best possible WCSS, in expectation, before Lloyd's algorithm even starts.

```check
Q: k-means++ has chosen its first centre. The other points have D² = 1, 9 and 0. What is the chance the point with D² = 9 is picked next?
- 1/3
* 90%
- 0%
= The chances are proportional to D²: 9 out of 1 + 9 + 0 = 10.
```

It is still random. In [Three round groups](#example:three-groups) the second draw lands on F, right next to the first centre: a 1% chance, and it happened. Lloyd's algorithm recovers this time, in 3 rounds, because the third centre lands in a group of its own. People usually run k-means several times from different seeds and keep the run with the lowest WCSS.

## Empty clusters

A centre can end up with no points. Then it has no mean, and Lloyd's algorithm says nothing about what to do. In [An empty cluster jumps](#example:empty-cluster) c3 starts at (10, 0), farther from every point than c1 or c2. With the default rule it jumps to the point farthest from its own centre, I(9, 9), and the run ends with three clusters and WCSS 4. With the other rule ([An empty cluster stays empty](#example:empty-stays)) it sits at (10, 0) forever and the run ends with two clusters and WCSS 7.60. Libraries differ here: some move the centre, some keep it, some stop with an error. Repeated points can cause the same thing, since two seeds can land on the same spot.

## Choosing k

You choose k, not the algorithm. More centres can always lower WCSS (the best split into k + 1 groups is never worse than the best into k): in [Four centres for three groups](#example:too-many-centres) the fourth centre splits the bottom left group in two and WCSS drops from 9.33 to 7.33. With k = N, every point is its own centre and WCSS is 0. So a lower WCSS does not mean a better k. A common approach is to plot WCSS against k and look for the bend where adding a centre stops helping much (the "elbow"). It is a judgment call, and on real data the bend is often not obvious.

## When to use it

k-means likes round groups of about the same size. It is fast, simple and easy to explain, which is why it is the first thing people try. It is also a building block: an IVF index runs k-means once on the vectors and then searches only the few cells nearest a query; product quantization runs it on pieces of the vectors to build a codebook.

Avoid it when the groups are not round. [Two long strips](#example:long-strips) has two obvious rows of points. k-means with k = 2 cuts them into a left half and a right half instead. It is not confused: left against right has WCSS 59, and the "obvious" top against bottom has 140. k-means minimized exactly what it was asked to minimize. The trouble is the question. For strips, rings or groups of very different sizes, density-based or graph-based clustering fits better.

## Common mistakes

- Running once and trusting the answer. Run several seeds and keep the lowest WCSS.
- Comparing WCSS across different k. The best WCSS only goes down as k goes up.
- Forgetting to scale the features. If x is in metres and y in kilometres, x decides everything.
- Moving a centre while still assigning points. Assign every point first, then move every centre.
- Expecting the same groups every time. With random seeding the labels and even the groups change from run to run.
- Ignoring empty clusters. Decide what your code does when a centre gets no points.

## At real scale

The toy has at most 12 points in 2 dimensions. Product quantization (Jégou, Douze and Schmid, 2011) cuts each vector into pieces and runs k-means with 256 centres on each piece, so a piece is stored as one byte. Lloyd's algorithm usually converges in a handful of rounds, but not always: Vattani (2011) built point sets in the plane that need exponentially many rounds.

## Try this

- [Centres placed by hand](#example:by-hand): place the centres at 1,1 and 7,5 instead. How many rounds now?
- [A bad start that never recovers](#example:bad-start): switch the seeding to k-means++ and load the same points with Run. Does it ever get stuck? Try a few times.
- [An empty cluster jumps](#example:empty-cluster): why does c3 jump to I and not to A?
- [Two long strips](#example:long-strips): with k = 4, do you get the rows back?
- Load 12 random points (type 12) and run with k = 1. Where does the one centre end up?
