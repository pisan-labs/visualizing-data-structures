# IVF index

You have a million embeddings and a query. Brute force measures all million, every time. An IVF index (inverted file) does the obvious thing first: split the vectors into groups once, ahead of time, and at query time look only in the groups near the query. The groups come from [k-means](/k-means/). The name comes from text search, where an [inverted index](/bm25/) files every document under the words it contains; here every vector is filed under its nearest centre.

Jégou, Douze and Schmid (2011) used it as the first half of their IVFADC index, and libraries such as Faiss offer it in several flavours. It is approximate. Sometimes the nearest vector is filed in a list nobody looks at.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| train | k-means finds nlist centres; every point goes into the list of its nearest centre | Θ(I·N·nlist) for I rounds, once |
| search(q) | measure q against every centre, then every point in the nprobe nearest lists | Θ(nlist + nprobe·N/nlist) with even lists |
| brute force | measure every point | Θ(N) |

N is the number of points. Distances are squared, d² = (x₁ − x₂)² + (y₁ − y₂)², as on the k-means page. The answer is the K = 3 nearest points found, checked against brute force: the recall is how many of the true 3 it found, and the answer is exact when it found all 3. [Show me](#play:across-the-border)

## Training: k-means makes the lists

[Three lists, one probe](#example:three-cells) loads 12 points in three loose groups. Train runs the k-means page's own Lloyd's algorithm with k = nlist = 3 and k-means++ seeding. It settles after 2 rounds and 96 distance computations, with c1 at (2, 2.5), c2 at (7.75, 2.5) and c3 at (4.5, 8.25). Then every point is filed under its nearest centre: A, B, C and D in list c1, E, F, G and H in c2, I, J, K and L in c3.

The lines on the plane are the borders of the cells. Every spot in a cell is nearer to its centre than to any other centre: a Voronoi diagram, the dual of the [Delaunay triangulation](/delaunay/). A list is the points that fall in one cell.

Training is the slow part, and it happens once. Searches reuse the same lists.

## Searching a few lists

In [Three lists, one probe](#example:three-cells) the query is q = (7, 3). First q is measured against the 3 centres: c2 is at d² 0.81, the other two at 25.25 and 33.81. With nprobe = 1 only list c2 is searched: E 2, F 1, G 1, H 5. The answer is F, G and E, after 7 distance computations (3 centres and 4 points) against brute force's 12. Brute force gets the same three. Exact, and less than two thirds of the work.

With nlist lists of about N/nlist points each, a search costs nlist distances for the centres plus about nprobe·N/nlist for the points. More lists make each list shorter, but there are more centres to measure. With nprobe = 1 the total is smallest when nlist is about √N.

```check
Q: An index has 3 lists holding 4, 6 and 2 points. The query's two nearest centres are the ones with 4 and 6 points. With nprobe = 2, how many distances does a search compute?
- 10
* 13
- 12
- 15
= 3 for the centres, then 4 + 6 for the points in the two lists searched: 13. The list of 2 is never looked at.
```

## Missing across the border

[The nearest neighbour across the border](#example:across-the-border) uses the same index with q = (6, 5). The centres are at d² 9.31 (c2), 12.81 (c3) and 22.25 (c1). c2 wins. The search measures E, F, G and H and returns E (5), F (8) and G (10). Brute force returns L, E and F: L at (6, 7) is at d² 4, the true nearest, and it is in list c3. L is nearer to c3's centre than to c2's, so that is where training filed it, and the query is on c2's side of the border. Recall 2/3. It found the second and third nearest and missed the first.

This is the failure that matters. The query and its nearest neighbour are close, but a border runs between them, and nothing in list c2 knows about L.

The fix is to search more lists. [A second list finds it](#example:two-probes) sets nprobe = 2: lists c2 and c3, 11 distance computations, and the answer L, E and F is exact. [Probe every list](#example:every-list) sets nprobe = 3. Always exact, and 15 distance computations, worse than brute force's 12: it measures every point plus the centres.

```check
Q: With nprobe = 1, the query falls in c2's cell, and its true nearest neighbour is in list c3. What does IVF return as the nearest?
- The true nearest anyway, since it is closest
* The nearest point in list c2
- Nothing, the search fails
= Only list c2 is searched, so points in c3 are never measured. IVF returns the best it saw, which is not the best there is.
```

## Uneven lists

k-means does not promise lists of the same size. [A crowded list saves nothing](#example:crowded-list) has nine points packed into one corner and three far away. k-means puts one centre on the crowd and spends the other two on the stragglers: lists of 9, 2 and 1. A query near the crowd, (3, 4), searches the list of 9, and with the 3 centres that is 12 distance computations, the same as brute force. The answer is exact, for what it's worth.

Real data has crowds too (lots of near-duplicate photos, one popular topic), and a query that lands in a big list is a slow query. [One list is brute force](#example:one-list) is the extreme: nlist = 1, every point in one list, 13 distance computations for 12 points.

## When to use it

IVF is a good choice for large collections where an occasional miss is fine: semantic search over embeddings, recommendations, deduplication. It needs little memory beyond the vectors themselves (each is stored once, in one list, plus nlist centres), and nprobe is chosen per query, so the same index can answer quickly or carefully. It combines well with compression: store each vector in its list as a short [product quantization](/product-quantization/) code instead of raw numbers, which is what IVFADC does.

Avoid it when you need exact answers, or when the data is small enough that brute force is fast anyway. [HNSW](/hnsw/) often gets higher recall for the same number of distance computations, at the cost of memory for its links. In two dimensions, as here, a [k-d tree](/kd-tree/) finds exact neighbours quickly; IVF earns its keep in hundreds of dimensions, where k-d trees stop helping.

## Common mistakes

- Setting nprobe to 1 and expecting exact answers. Measure recall on your own queries and raise nprobe until it is good enough.
- Setting nprobe equal to nlist. That is brute force plus the centres.
- Using too many lists for the data. With nlist close to N, the lists hold a point or two and the centres are most of the work.
- Training on too few vectors. k-means needs many points per centre to find sensible cells.
- Adding lots of new vectors without retraining. They go into the nearest list, and if the data drifts, some lists grow long.

## At real scale

The toy has 12 points in 2 dimensions and up to 5 lists. Faiss's IVF indexes search nprobe = 1 list unless you ask for more. Some arithmetic: a million vectors in 1,000 lists is about 1,000 per list. With nprobe = 8, a query measures 1,000 centres and about 8,000 vectors, roughly 9,000 distances instead of a million. The same idea goes back at least to Sivic and Zisserman (2003), who clustered image features into "visual words" with k-means and searched video frames with an inverted file, as a search engine does with text.

## Try this

- [The nearest neighbour across the border](#example:across-the-border): search for (2, 6) and (9, 7). Both miss a neighbour with nprobe = 1. Which point does each one miss, and which list is it in?
- [Three lists, one probe](#example:three-cells): set nlist to 4 and press Train again, then search for (7, 3). Which list did k-means split, and did the search get cheaper?
- [A crowded list saves nothing](#example:crowded-list): set nlist to 5 and train again. Do the crowded points get more lists?
- Load 12 random points (type 12), train, and search a few queries with nprobe = 1. How often is the answer exact?
- Set nprobe to 2 and repeat. How much does the recall go up, and how much does the work?
