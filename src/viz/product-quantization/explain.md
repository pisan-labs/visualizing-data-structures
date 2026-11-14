# Product quantization

A million embeddings of 768 numbers each, stored as 32-bit floats, take about 3 GB. A billion take 3 TB. Product quantization (Jégou, Douze and Schmid, 2011) shrinks each vector to a few bytes: cut it into pieces, learn a small codebook of typical pieces with [k-means](/k-means/), and store, for each piece, only the number of the nearest codebook entry. The vector itself is thrown away.

Then comes the clever part. You can still measure a query's distance to every stored vector, approximately, without decoding anything: a small table and a few additions per vector.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| train | cut the vectors into m pieces; k-means with k* centres on each piece | Θ(I·N·k*·d), once |
| encode(x) | for each piece, the number of its nearest centre | Θ(k*·d) |
| search(q) | a table of d² from each piece of q to every centre of its codebook, then m lookups per stored vector | Θ(k*·d + N·m) |
| exact search | measure every vector | Θ(N·d) |

Here the vectors have d = 4 numbers, N is how many there are, m is the number of pieces and k* the codebook size. A code takes m·log₂ k* bits. Distances are squared, as on the k-means page. [Show me](#play:two-pieces)

## Codebooks

[Two pieces, four centres each](#example:two-pieces) loads 8 vectors of 4 numbers. Piece 1 is the first two numbers, piece 2 the last two. Train runs k-means with k* = 4 on the eight pieces 1, and again on the eight pieces 2. The two small planes show them: each piece is a point in two dimensions, and each codebook is 4 centres with their cells.

Codebook 1 comes out as 0 = (1, 1.5), 1 = (9, 8.5), 2 = (1.5, 9), 3 = (8.5, 1). Codebook 2 is 0 = (1, 8.5), 1 = (8.5, 9), 2 = (1.5, 1), 3 = (9, 1.5). That is 16 numbers in all, shared by every vector, however many there are.

## Codes

Encode replaces each vector by its nearest centres. A = (1, 9 | 1, 8): piece 1 is nearest centre 2 of codebook 1 (d² 0.25), piece 2 is nearest centre 0 of codebook 2 (d² 0.25). So A is stored as the code 2 0, and from now on A means (1.5, 9 | 1, 8.5).

Two codes of 2 bits each is 4 bits, against 128 bits for 4 floats: 32 times smaller. Each vector here is off by 0.5 (squared), 4 in all. The product in the name is the trick: 4 centres for piece 1 times 4 for piece 2 gives 16 different vectors a code can stand for, from only 8 stored centres. With m pieces it is k*^m from m·k*.

```check
Q: Codebook 1 has the centres 0 = (1, 1.5), 1 = (9, 8.5), 2 = (1.5, 9) and 3 = (8.5, 1). A vector's piece 1 is (8, 2). What is its code for piece 1?
- 0
- 1
- 2
* 3
= d² to centre 3 is 0.5² + 1² = 1.25. To centre 1 it is 1² + 6.5² = 43.25; the others are farther still.
```

## Distances from a table

Search for q = (2, 8 | 2, 7) in the same example. The query is not encoded; it stays exact. That is the asymmetric distance computation (ADC) in the paper. First the table: piece 1 of q, (2, 8), against the four centres of codebook 1 gives 43.25, 49.25, 1.25 and 91.25. Piece 2, (2, 7), against codebook 2 gives 3.25, 46.25, 36.25 and 79.25. Eight small distances, once per query.

Now every stored vector costs two lookups and an addition. A is 2 0: entry 2 of row 1 plus entry 0 of row 2, 1.25 + 3.25 = 4.5. The exact d² from q to A is 4. Not bad for 4 bits.

Why does adding work? A squared distance is a sum over the numbers, so it splits over the pieces: the d² from q to A's centres is the d² on piece 1 plus the d² on piece 2. The table's 4.5 is exactly the distance from q to (1.5, 9 | 1, 8.5), the vector A's code stands for. The only error is the encoding error.

```check
Q: The table's row 1 is 43.25, 49.25, 1.25, 91.25 and row 2 is 3.25, 46.25, 36.25, 79.25. What distance does it give for a vector stored as the code 2 1?
- 4.5
* 47.5
- 49.25
- 95.5
= Entry 2 of row 1 is 1.25 and entry 1 of row 2 is 46.25. Add them: 47.5.
```

The table gives A 4.5, E 46.5 and B 47.5. Exactly, the nearest three are A 4, B 54 and E 55. The same three vectors; B and E swap places.

## When the table gets it wrong

The error can change the order at the top too. [The table swaps the two nearest](#example:order-flips) searches for (2, 5 | 2, 7). The table says E 16.5, then A 19.5. Exactly it is A 19, then E 22. A small error in each piece, added up, is enough when two vectors are close in distance.

It gets worse when two vectors share a code. In [Two centres: one bit a piece](#example:two-centres), codebooks of k* = 2 give each vector 2 bits. A = (1, 9, 1, 8) and C = (9, 9, 1, 1) both get the code 1 0, so the table gives them the same distance, 16.75. Exactly, A is at 4 and C at 87. The squared errors add up to 230 here, against 4 with four centres.

## More centres or more pieces

The two settings trade memory for accuracy in different ways. On the same 8 vectors:

| Example | Pieces | Centres | Bits a vector | Squared error |
|---|---|---|---|---|
| [One piece is plain k-means](#example:one-piece) | 1 | 4 | 2 | 175.5 |
| [Two centres](#example:two-centres) | 2 | 2 | 2 | 230 |
| [Two pieces](#example:two-pieces) | 2 | 4 | 4 | 4 |
| [Four pieces of one number](#example:four-pieces) | 4 | 4 | 8 | 0 |
| [A codebook as big as the data](#example:eight-centres) | 2 | 8 | 6 | 0 |

One piece is ordinary vector quantization: k-means on whole vectors, and only 4 vectors a code can stand for. A and E both land on centre 0, and the table cannot tell them apart. Four pieces of one number each has no error here only because each number takes just four values (1, 2, 8 or 9). And eight centres for eight vectors is no compression at all: the 16 centres of 2 numbers are 32 numbers, exactly as many as the data. On real data the codebooks are tiny next to the codes.

## When to use it

Product quantization is for collections too big to keep in memory as floats: billions of image descriptors, or embeddings for retrieval. Distances by table lookups are fast, and the table is reused for every stored vector. A common recipe is to search the codes for a few hundred candidates and then re-rank those with exact distances (if the vectors are on disk), which fixes most of the swapped orders.

It combines with an [IVF index](/ivf-index/): the index picks a few lists, and the vectors in them are stored as codes. That is IVFADC, the second half of the same paper (it encodes each vector's offset from its list's centre, which is more accurate). Compare the [quantization](/quantization/) page, which rounds each number to a few bits on its own; product quantization rounds whole pieces of a vector to the nearest learned centre, so it can use what the numbers have in common.

Avoid it when the data is small enough to keep exactly, or when you need exact distances. A graph index such as [HNSW](/hnsw/) is often more accurate for the same work, but keeps the full vectors plus the links.

## Common mistakes

- Cutting where the pieces depend on each other. In [Pieces that copy each other](#example:copied-pieces) the last two numbers repeat the first two, so the two codebooks learn the same centres and only 4 of the 16 possible codes ever appear. Half the bits are wasted. Ge et al. (2013) learn a rotation of the vectors first, chosen to make the quantization error smaller.
- Training on too few vectors. k-means needs many vectors per centre, or the codebook memorizes the training set (as in the eight-centres example).
- Encoding the query too (symmetric distance). It is allowed, and the paper describes it, but it adds the query's error to every distance; ADC keeps the query exact for about the same cost.
- Forgetting the codebooks. They are k*·d numbers in all, small next to a billion codes, but not next to 8.
- Trusting the order of the top few. Re-rank with exact distances when you can.

## At real scale

The toy has 4 numbers per vector, 2 pieces and 4 centres. Jégou, Douze and Schmid (2011) use k* = 256 centres per piece, so a code is one byte, and m = 8 pieces for 128-number SIFT descriptors: 8 bytes a vector instead of 512 bytes of floats, 64 times smaller. The table then has 8 × 256 = 2048 entries, and each stored vector costs 8 lookups. Faiss offers product quantization on its own and inside IVF indexes.

## Try this

- [Two pieces, four centres each](#example:two-pieces): search for 9,8,9,2. Is the nearest by the table the exact nearest?
- [The table swaps the two nearest](#example:order-flips): set the codebook size to 8, train and encode again, and repeat the search. Is the order right now? Why?
- [One piece is plain k-means](#example:one-piece): which other vectors share a code? What does the table say about them?
- [Pieces that copy each other](#example:copied-pieces): switch to one piece of 4 numbers and train again. Do you lose anything with half the bits?
- Load 10 random vectors (type 10), and compare the squared error with 2 and with 4 pieces.
