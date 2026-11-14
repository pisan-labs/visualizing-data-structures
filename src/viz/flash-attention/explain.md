# FlashAttention (online softmax)

[Self-attention](/self-attention/) builds an n × n table: every query scored against every key, then a softmax along each row. Written the plain way, the table goes to the GPU's main memory (HBM), comes back for the softmax, goes out again as weights, and comes back once more to blend the values. The arithmetic is quick. The trips to memory are not.

Dao et al. (2022) asked a different question: what if the table never leaves the chip? Cut Q into blocks of rows and K and V into blocks of rows, and work on one tile at a time in the small, fast memory on the chip (SRAM). The catch is softmax: each row's weights need the largest score and the sum of the whole row, and a tile only sees part of the row. The fix is a running max and a running sum, rescaled when a bigger score turns up. That is the online softmax, and the answer comes out exactly the same.

Q, K and V here come from the hand-made head of the self-attention page, so you can check every number there.

## The idea

| Step | What it does | Cost |
|---|---|---|
| tile | one block of B_r queries against one block of B_c keys, on chip | Θ(B_r · B_c · d) |
| update a row | new max m, rescale the old sum ℓ and output O, add the tile's terms | Θ(B_c · d) |
| all tiles | every tile the mask does not hide | Θ(n² · d), the same as plain attention |
| memory for the scores | one tile at a time, plus m and ℓ for each row | Θ(B_r · B_c + n), not Θ(n²) |

Here d is the width of a query, key or value (2 here). The arithmetic is not reduced at all. What changes is what gets stored and what moves. [Show me](#play:cat-sat-tiles)

## Tiles

Start with [Six tiles instead of one table](#example:cat-sat-tiles). Six words and blocks of 2 cut the 6 × 6 table into 9 tiles. The causal mask hides every score above the diagonal, and 3 tiles are hidden completely, so they are skipped. 6 tiles, 21 scores, never more than 4 on chip at a time.

The picture is laid out as a matrix product: Q down the left, Kᵀ and Vᵀ across the top, the scores where they meet, and each row's m, ℓ and O on the right. Only the tile on chip shows its scores. A finished tile goes blank: its scores were thrown away, never written anywhere.

With K/V blocks outside (the 2022 paper's order), each block of keys and values comes onto the chip once, and the Q blocks go by. Each Q block brings its O, m and ℓ along, updates them, and puts them back.

## The online softmax

Each row keeps three numbers as the tiles go by: m, the largest score so far; ℓ, the sum of e^(s − m) over the scores so far; and O, the blend of the values so far. For a new tile with scores s_j:

- the new max is m′ = max(m, the tile's largest score);
- the old sum and output shrink by a = e^(m − m′), and the tile's terms count e^(s_j − m′);
- ℓ′ = a · ℓ + Σ e^(s_j − m′), and O′ = (a · ℓ · O + Σ e^(s_j − m′) · v_j) / ℓ′.

Why rescale? The old ℓ was a sum of e^(s − m) with the old m. With a new m′, every one of those terms should have been e^(s − m′) = e^(s − m) · e^(m − m′). Multiplying the whole sum by e^(m − m′) fixes all of them at once, without seeing the old scores again.

In [A later tile has the best score](#example:max-grows), sat's best key, cat, comes last. After the first tile sat's max is 0.28, from ball, and ℓ = 1.18. The second tile does not beat it. The third has cat at 2.83: m becomes 2.83, the old ℓ = 1.61 and the old O shrink by e^(0.28 − 2.83) = 0.08, and cat's value goes in at full weight. O ends at (.85, .14).

```check
Q: A row has m = 1 and ℓ = 2. The next tile gives it one score, 3. What is ℓ after the tile, to two decimals?
- 3.00
* 1.27
- 22.09
- 2.14
= The new max is 3. Rescale the old sum: e^(1 − 3) × 2 = 0.27. Add the new term, e^(3 − 3) = 1: ℓ = 1.27.
```

When the tile's largest score is no bigger than m, nothing old is rescaled (a = 1) and the new terms simply count less. That is what happens to sat in the first example: its second tile, sat itself with score 0, adds e^(0 − 2.83) = 0.06 to ℓ.

## The same answer

After the last tile, m is each row's largest score, ℓ is the sum of e^(s − m) over the whole row, and O is the softmax-weighted blend of every value. That is plain attention, step for step, just in a different order. The last step of each run compares O with the self-attention page's answer: they agree to within 10⁻¹⁵, the rounding of a float. sat ends at (.93, .09) as it does there, 93% cat.

[Plain attention writes the whole table](#example:plain-table) does it the plain way. Its row max and row sum are FlashAttention's final m and ℓ. It also moves 192 numbers to and from HBM, and 144 of them are the table: the 36 scores written and read back, the 36 weights written and read back.

## Counting what moves

The counters count numbers moved between HBM and the chip. With K/V blocks outside:

- O, m and ℓ start in HBM: 2 + 1 + 1 numbers per row, written once;
- each K/V block is read once;
- each tile reads its Q block and the block's O, m and ℓ, and writes O, m and ℓ back.

For the six words that is 24 + 24 + 6 × 20 = 168, against 192 for plain attention. Not much of a saving. Turn the mask off ([Without the mask: every tile, and a max that grows](#example:no-mask)) and it is 228, more than plain attention. And [Blocks of one row: the most traffic](#example:one-row-blocks) moves 258.

So what is going on? The toy is too small. Each row's m and ℓ are 2 numbers, the same as its row of O, so moving them costs as much as moving the output. And plain attention's table is only 36 cells. At real sizes a row of O has 64 or 128 numbers against 2 for m and ℓ, and n is in the thousands, so the n² table is millions of numbers per head. The paper shows FlashAttention needs Θ(n² d² / M) accesses to HBM, with M the size of the on-chip memory, against Θ(n d + n²) for plain attention. For d of 64 to 128 and M around 100 KB, d² is many times smaller than M, so the accesses are many times fewer.

Bigger tiles help. [One block of keys: nothing to rescale](#example:one-kv-block) puts all four keys in one K/V block: each Q block meets every key at once, nothing is ever rescaled, and 72 numbers move against 96.

```check
Q: With K/V blocks outside, how many times is each block of K read from HBM?
* Once
- Once per Q block
- Once per tile
- Never: it stays in HBM
= The outer loop brings each K/V block onto the chip once and keeps it there while every Q block goes by. It is Q, O, m and ℓ that are read again for every tile.
```

## Loop order: FlashAttention-2

FlashAttention-2 (Dao 2023) swaps the loops: Q blocks outside, K/V blocks inside. Now a Q block comes on chip once, its m, ℓ and O stay on chip through all the K/V blocks, and O is written once at the end. K and V are read once per Q block instead. [Q blocks outside: the loop order of FlashAttention-2](#example:q-outside) moves 72 numbers instead of 168, with the same outputs.

FlashAttention-2 also keeps O unscaled until the end and divides by ℓ once, which saves arithmetic that is not matrix products. This page does the same arithmetic in both orders, so the outputs match to the last bit; only the order of the tiles and the traffic change.

## When to use it

Whenever attention runs over long sequences on a GPU, in training and in serving. It gives the same answer as plain attention, so there is nothing to lose but the trouble of writing the kernel. Training also needs the attention weights for the backward pass; FlashAttention stores only m and ℓ per row and recomputes the tiles, which is cheaper than reading the n² table back.

When a model generates text, each new token is one query against every key and value in the [KV cache](/kv-cache/): the same loop over K/V blocks, with a Q block of one row. There is no table to keep then, only a row of scores, so the saving is smaller.

For a handful of tokens it does not matter, as the toy shows. The table fits anywhere.

## Common mistakes

- Thinking FlashAttention approximates attention. It is exact, up to the rounding of floats.
- Thinking it does less arithmetic. It does slightly more (the rescaling); it moves less.
- Forgetting to rescale ℓ and O when m grows. The weights then add up to more than 1.
- Adding a tile's values to O without weighting. O is an average: the old part counts a · ℓ, the tile's part its terms e^(s − m′), and the whole is divided by the new ℓ.
- Updating a row with a fully masked tile. Its max would be −∞, and e^(−∞ − (−∞)) is not a number. Skip it.
- Thinking the block sizes change the answer. They change the traffic and the steps; O is the same.

## At real scale

Dao et al. (2022) describe the A100 GPU: 40 to 80 GB of HBM with a bandwidth of 1.5 to 2.0 TB/s, and 192 KB of on-chip SRAM in each of its 108 streaming multiprocessors, with a bandwidth of about 19 TB/s. Their measurement on GPT-2 medium (sequence length 1024, head width 64, 16 heads, batch 64): plain attention did 66.6 GFLOPs and read and wrote 40.3 GB of HBM in 41.7 ms; FlashAttention did more arithmetic, 75.2 GFLOPs, but moved only 4.4 GB and took 7.3 ms. The toy here has 7 words at most and keys of width 2.

## Try this

- In [Six tiles instead of one table](#example:cat-sat-tiles), press Next tile until sat's row has m. Predict ℓ for the next tile before you step.
- Switch the K/V block to 3 rows. How many tiles are there now, and how many numbers move?
- In [A later tile has the best score](#example:max-grows), change the sentence to "the cat and the ball sat". Does sat's max still grow?
- Turn the mask off and try every block size. Which one moves the fewest numbers, and why?
- Use **Compare** to run the same sentence with K/V blocks outside and Q blocks outside, side by side.
