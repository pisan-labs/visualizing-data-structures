# Graph representations

Draw a graph on the whiteboard and everyone sees the same picture. The computer does not get a picture. It gets the graph stored in some data structure, and that choice decides which questions are cheap and which ones are slow. This page keeps one graph in three structures at once and counts the work each one does.

## The idea

A graph has V vertices and E edges. There are three common ways to store it, and they are good at different things. Every entry in the table is big-O, and deg(u) is the number of edges at u.

| Operation | List | Matrix | Edges |
|---|---|---|---|
| Space | V + E | V² | V + E |
| `hasEdge(u, v)` | deg(u) | 1 | E |
| `neighbours(u)` | deg(u) | V | E |
| `addEdge(u, v)` | deg(u) | 1 | E |
| `addVertex(x)` | 1 | V² | 1 |
| `removeVertex(x)` | V + E | V² | E |

Adding an edge includes checking that it is not there already. Without the check, all three add an edge in O(1). Every operation on this page runs on all three, and the variables count the entries each one touches. [Show me](#play:edge-list-worst)

## Adjacency list

Each vertex gets a list of its neighbours: `Adj[u]` holds every v with an edge u-v. In an undirected graph every edge shows up twice, v in `Adj[u]` and u in `Adj[v]`, so the lists hold 2E entries in all. A directed graph lists each arc once, under its tail.

Asking "is there an edge u-v?" means walking down `Adj[u]` until you find v or run out. That costs up to the degree of u. In [the star](#example:list-worst), A is joined to all 7 other vertices and the edge we want is last, so the list makes 7 checks. [Show me](#play:list-worst)

Where the list shines is `neighbours(u)`. The list is the answer, and reading it costs exactly the degree of u. Breadth-first search, depth-first search, Dijkstra and Prim all ask for neighbours over and over. Over a whole search that adds up to O(V + E). This page keeps every list in name order, so B comes before C. Any order would do; a fixed one means every search on this site visits neighbours the same way.

```check
Q: An undirected graph has V vertices and E edges. How many entries are in all its adjacency lists together?
- E
* 2E
- V + E
- V²
= Each edge u-v is stored twice: v in Adj[u] and u in Adj[v].
```

## Adjacency matrix

The matrix has a row and a column for every vertex. `M[u][v]` is 1 when there is an edge from u to v and 0 when there is not. With weights, the cell holds the weight, and this page leaves the cell blank when there is no edge, so an edge of weight 0 still shows. An undirected graph gives a symmetric matrix: row A reads the same as column A.

`hasEdge(u, v)` is one cell, whatever the graph looks like. That is the matrix's big win. [Show me](#play:sparse)

The price is space, and every question about "all the neighbours". The matrix has V² cells whether the graph has 7 edges or 7,000. [The path](#example:sparse) has 8 vertices and 7 edges, and 50 of its 64 cells are 0. A matrix for a million vertices has a trillion cells. Most of them say 0. `neighbours(u)` has to read all of row u, V cells, even when u has one neighbour. [Show me](#play:neighbours-row)

Adding a vertex hurts too. There is no room for one more row and column, so the whole matrix is copied into a bigger one. [Add a vertex](#example:add-vertex-copy) copies all 64 cells. Keeping spare rows, the way a dynamic array keeps spare slots, brings that down to O(V) amortized.

```check
Q: A graph has 1000 vertices and 3000 edges, undirected. How many cells does its adjacency matrix have?
- 3000
- 6000
- 4000
* 1,000,000
= A cell for every pair: 1000 × 1000 = 1,000,000. The adjacency lists hold 2 × 3000 = 6000 entries.
```

## Edge list

The simplest of the three: one row per edge, `(u, v)` or `(u, v, w)`. It is what you type when you load a graph here. It is also what you get from a file or a spreadsheet.

It answers almost nothing quickly. `hasEdge` and `neighbours` both have to read the rows, up to all E of them. [Not there](#example:edge-list-worst) reads all 10 rows to say no. [Show me](#play:edge-list-worst) An edge list cannot even hold a vertex with no edges, so it keeps a separate list of vertices. [Show me](#play:disconnected)

So why keep it? Some algorithms only ever walk through all the edges. Kruskal's minimum spanning tree sorts the edges by weight and takes them in order. Bellman-Ford relaxes every edge, again and again. For those, a plain list of edges is all they need.

## Which one to use

Most graphs we care about are sparse: E is closer to V than to V². Road maps, course prerequisites and web links all look like that. Use adjacency lists for them, and for any algorithm that walks from vertex to neighbour. That covers most of this course.

Use a matrix when the graph is dense, as in [the complete graph](#example:dense), where the lists already hold 30 entries against the matrix's 36 cells. Use one when you need "is there an edge u-v?" in O(1), or when the algorithm thinks in rows and columns anyway (Floyd-Warshall does).

Keep an edge list when the algorithm takes edges one at a time and does not care where they start.

## Directed graphs and weights

In a directed graph, `Adj[u]` holds only the edges out of u, and the matrix is no longer symmetric. In [the directed example](#example:directed-arcs), A>C is an edge and C>A is not, so `M[A][C]` = 1 and `M[C][A]` = 0. [Show me](#play:directed-arcs)

Weights ride along. A list entry becomes a pair (v, w), a matrix cell holds w, and an edge list row gets a third column. [Weights](#example:weighted)

## Common mistakes

- Forgetting the second entry. Adding an undirected edge u-v means v goes into `Adj[u]` and u goes into `Adj[v]`. Miss one and a search sees a one-way street.
- Thinking the matrix is always faster. It is faster for `hasEdge`. A search that asks for neighbours pays V per vertex, so BFS on a matrix is O(V²) even on a path.
- Using 0 for "no edge" in a weighted matrix when 0 is a real weight. Pick something that cannot be a weight, such as ∞ or a blank.
- Counting matrix space as O(E). It is V² cells from the start, edges or not.
- Assuming lists come sorted. Unless you keep them sorted, neighbours come out in the order the edges were added, and two runs of the same search can differ.

## Try this

- [The star](#example:list-worst): how many checks would `hasEdge(A, B)` take in each representation?
- [Two pieces and a loner](#example:disconnected): look at row F of the matrix, then try Neighbours of F.
- [Remove a vertex](#example:remove-vertex). Then remove another and watch the matrix shrink.
- Load `A-B, B-C, C-D, D-E, E-F, F-G, G-H, H-A` and ask Has edge? for A-E. Which representation wins, and by how much?
- Start over with the dense random graph at 10 vertices. Count the zeros left in the matrix.
