# Quantization (int8, int4)

A weight is usually stored as a 16-bit float. A model with 7 billion of them is 14 GB before it has read a single word. Store each weight in 8 bits instead and it is 7 GB; in 4 bits, 3.5 GB. Generating text is mostly reading weights from memory, so smaller weights are also faster weights.

The catch: 8 bits give 256 codes, 4 bits give 16. Quantization picks a **scale** that maps a group of weights onto those codes, rounds each weight to the nearest code, and keeps the scale so the codes can be turned back into numbers. Some precision is lost. The question is how much, and where.

## The idea

| Step | Absmax (symmetric) | Zero-point (asymmetric) |
|---|---|---|
| scale | s = 127 / max \|w\| (7 for int4) | s = 255 / (max − min) (15 for int4) |
| zero point | none: code 0 is 0 | z = round(−min · s) |
| code | q = round(s · w), from −127 to 127 | q = round(s · w) + z, from 0 to 255 |
| decode | ŵ = q / s | ŵ = (q − z) / s |

Each step is Θ(n) for n weights: one pass for the largest weight (or the min and max), one for the codes. Round takes halves away from 0. The notation follows Dettmers et al. (2022), the LLM.int8() paper: s is the scaling constant, codes per unit. A **group** shares one s: the whole matrix (per-tensor), each row, or each block of 3 neighbours in a row. [Show me](#play:int8-round-trip)

## int8: almost nothing lost

Start with [int8 keeps almost everything](#example:int8-round-trip). 24 small weights, the largest .81 in size, one scale for all of them: s = 127 / .81 = 157. The first weight, .31, becomes 157 × .31 = 48.6, which rounds to code 49. Decoding gives 49 / s = .313. The error is .003.

One code step is 1 / s = .006, and rounding never misses by more than half a step. So no error here is larger than .003, and the 24 of them add up to .040. At two decimals you cannot see the difference between W and ŵ at all.

```check
Q: A group's largest weight is 0.5. With int8 absmax, what code does the weight 0.2 get?
- 20
* 51
- 102
- 127
= s = 127 / 0.5 = 254, and 254 × 0.2 = 50.8, which rounds to 51. The weight 0.5 itself gets 127.
```

## int4: 15 codes

Same weights, 4 bits: [int4 has only 15 codes](#example:int4-rough). Now s = 7 / .81 = 8.64 and a step is .116. Every weight lands on one of −7 to 7. The largest error is .057, the total .710, and two weights, .04 and −.05, round to code 0: they are lost.

About 18 times the total error, for half the memory. Whether that matters depends on the model, and on how the scales are chosen.

## One outlier

Now change one weight. [One outlier ruins a shared scale](#example:outlier-tensor) sets row 2, column 5 to 6.4, about eight times the next largest. With one scale for the whole matrix, the outlier sets it: s = 7 / 6.4 = 1.09, a step of .914. Every weight smaller than half a step, .457, rounds to 0. That is 16 of the other 23. The total error jumps from .710 to 5.39. The outlier itself is exact. Everything else is gone.

int8 copes better, but pays too: [The same outlier in int8](#example:outlier-int8) has a step of .050 instead of .006, so the largest error is .025 instead of .003. Eight times worse, because the scale is eight times coarser.

This is the problem Dettmers et al. found in real models. From about 6.7 billion parameters on, a few hidden-state features take values far larger than the rest, and plain 8-bit quantization starts to fail. LLM.int8() keeps those few feature dimensions in 16 bits and quantizes the rest in 8 bits with a scale per row or column.

```check
Q: One scale, int4 absmax. The largest weight is 3.5. Which weights decode to 0?
- Only exact zeros
- Those smaller than 0.5 in size
* Those smaller than 0.25 in size
- Those smaller than 3.5 / 15 in size
= s = 7 / 3.5 = 2, so a step is 0.5 and half a step is 0.25. Anything smaller than 0.25 in size rounds to code 0.
```

## More scales

The fix is to give the outlier less to spoil. With [A scale per row keeps the damage in one row](#example:outlier-rows), only row 2 gets the coarse step. The other rows keep their own scales; 6 weights are lost instead of 16, and the total error is 1.72. With [Blocks keep it to three weights](#example:outlier-blocks), each block of 3 has its own scale, so the outlier shares a scale with only two neighbours: 4 weights lost, total error .687, less than int4 without any outlier at all.

Scales cost memory. Here each is a 32-bit float, and with blocks of 3 that is 32 / 3 = 10.7 extra bits per weight: 14.67 bits in all, nearly the 16 we started with. The toy's blocks are far too small. QLoRA's blocks hold 64 weights, and its scales cost half a bit per weight.

## Zero-point codes

Absmax is symmetric: as many codes below 0 as above. If every weight is positive, half the codes are never used. In [All positive: absmax wastes half its codes](#example:positive-absmax), only codes 0 to 7 appear, and the total error is .710. A zero point stretches all 16 codes over the range the weights actually use. In [All positive: a zero point uses every code](#example:positive-zeropoint), s = 15 / .81 = 18.5, z = 0 (the range starts at 0), codes run from 0 to 15, and the total error falls to .312.

The range always includes 0, so 0 has an exact code, z. That matters: a lot of values in a network are exactly 0 (after a ReLU, for example), and a zero that decodes as .03 would be a bad trade. For weights spread evenly around 0, zero-point buys almost nothing, and costs a subtraction and a stored z per group.

## When to use it

Quantizing the weights pays off when memory is what limits you: a model that would not fit on one GPU, or a server that wants room for more [KV caches](/kv-cache/) and a bigger [batch](/continuous-batching/). The same idea can shrink the KV cache itself. int8 with some care for outliers costs very little; int4 needs scales per block, and sometimes more care about which weights matter most.

Avoid it for training the weights themselves: gradient steps are often smaller than a code step, and would round away. (QLoRA freezes the 4-bit weights and trains small 16-bit additions instead.)

Unlike [Huffman coding](/huffman/) or [LZ compression](/lz-compression/), quantization is lossy on purpose. Nothing gets the exact weights back.

## Common mistakes

- Using one scale for a tensor with an outlier. Look at the **lost to 0** counter.
- Forgetting the scales in the memory count. Look at **bits per weight**.
- Thinking int4 means 16 codes either side of 0. It means 16 codes in all; absmax uses 15 of them.
- Rounding a code past the end of the range. Zero-point codes are clamped to 0 to 255 (or 0 to 15).
- Expecting the error to shrink when the matrix gets bigger. It depends only on the step, 1 / s, of each group.
- Confusing a weight of 0 with a small weight. 0 always decodes exactly; a small weight can become 0 too, and then it is gone.

## At real scale

Dettmers et al. (2022) ran 175-billion-parameter models with LLM.int8() without losing performance, with more than 99.9% of the values multiplied in 8 bits; the outlier features they keep in 16 bits are those of size 6 or more. QLoRA (Dettmers et al., 2023) stores weights in 4 bits with one 32-bit constant per block of 64, which is 0.5 bits per weight, and quantizes those constants again to bring it down to 0.127 bits. That is how it finetunes a 65-billion-parameter model on a single 48 GB GPU. The toy here has 24 weights, and blocks of 3.

## Try this

- In [int4 has only 15 codes](#example:int4-rough), before you step, find the weight you expect to have the largest error. Then check the error panel.
- In [One outlier ruins a shared scale](#example:outlier-tensor), try every grouping and both bit widths. Which gives the smallest total error for the fewest bits per weight?
- Set the outlier back to .58 (Set one weight: `2 5 .58`) and quantize again. Does the per-row scale still help?
- Load 24 copies of 0.3. What is s, what are the codes, and what is the error?
- Switch [All positive: a zero point uses every code](#example:positive-zeropoint) to int8. How small does the total error get?
