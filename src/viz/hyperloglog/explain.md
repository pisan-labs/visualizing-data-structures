# HyperLogLog

How many different people visited the site today? The exact answer needs a set of every visitor seen, which for a big site is millions of entries. HyperLogLog gives an answer within a few percent using 12 KB, and the same 12 KB whether there were a thousand visitors or a billion. It does that by remembering almost nothing: for each of m registers, one small number.

## The idea: rare patterns mean many items

Flip a coin until it comes up heads. Getting 5 tails first happens about once in 32 tries. So if someone tells you the longest run of tails they saw was 5, you'd guess they tried about 32 times.

Hash each item to a string of random-looking bits. The number of leading zeros plays the role of the run of tails. If the longest run of leading zeros over all items is 9, there were probably around 2^10 distinct items. And repeats don't matter: the same item always hashes to the same bits, so seeing it twice tells you nothing new. That's exactly what counting distinct items needs.

One run length is a terrible estimate (one lucky item and you're off by a factor of a thousand). HyperLogLog splits the items into m groups and averages.

## The operations

The sketch is m = 2^b registers M[0 … m − 1], all 0. Each item is hashed to 16 bits here (MurmurHash3's finalizer, keeping the top 16 bits; real systems use 64).

| Operation | What it does | Cost |
|---|---|---|
| `add(x)` | The first b bits of h(x) pick register j; ρ is the position of the first 1 in the rest; M[j] = max(M[j], ρ) | O(1) |
| `estimate()` | E = α·m²/Σ 2^−M[j], with a correction for small counts | O(m) |

Each step shows the hash bit by bit: the register bits on the left, then the run of zeros and the 1 that ends it. In [The first few items](#example:first-items), the five items go to five different registers. [Show me](#play:first-items).

```check
Q: m = 16 registers, so the first 4 bits pick the register. h(x) = 1010 0011 0000 0000. Which register, and what is ρ?
* Register 10, ρ = 3
- Register 10, ρ = 2
- Register 5, ρ = 3
= 1010 is 10. After it come 0, 0, then a 1: the first 1 is in position 3, so ρ = 3.
```

## The estimate

Register j has seen roughly n/m items, and its value M[j] says about log₂ of that. So 2^M[j] estimates the size of group j, and m times an average of them estimates n. Which average? The arithmetic mean is ruined by one lucky register (a ρ of 12 contributes 4096). HyperLogLog uses the harmonic mean, which listens to the small values:

E = α·m² / Σⱼ 2^−M[j]

α (0.673 for m = 16) corrects a bias that the analysis works out exactly. **Estimate** goes through it step by step: Z, the sum, then E. Variables shows the estimate after every add next to the true number of distinct items, so you can watch the error move.

[A hundred distinct items](#example:hundred-items) estimates 90.1. With 16 registers the standard error is 1.04/√16 = 26%, so that's a good day. [More registers, smaller error](#example:more-registers) uses 32 registers and gets 105.3. To halve the error you need four times the registers. Real systems use 2^14 registers of 6 bits each: 12 KB for about 0.8%.

And [Repeats do not count](#example:duplicates) adds three items four times each. The registers stop changing after the first round.

## Small counts

With only a few items, most registers are still 0, and each of those adds 2^0 = 1 to the sum. A register that saw anything holds at least 1, but the formula treats the zeros as data, and it overestimates badly. Even an empty sketch reports α·m = 10.8. [Without the correction](#example:no-correction) shows that, then 15.8 for 8 items.

Flajolet's fix: when E ≤ 2.5m and V registers are still 0, use linear counting, m·ln(m/V). It's the estimate you'd make from how many buckets are still empty after throwing balls at random. [Small-range correction](#example:small-range) turns 15.8 into 9.2 for the same 8 items. [Show me](#play:small-range). The **Small-range correction** option turns it on and off.

There's a matching large-range correction for 32-bit hashes, when hash collisions start to hide items. With 16-bit hashes and keys up to 999 we never get close, so it's left out.

```check
Q: m = 16, 12 registers are still 0, and the raw formula says E = 13. What does the sketch report with small-range correction on?
- 13, the raw estimate
* 16·ln(16/12), about 4.6
- 12, the number of empty registers
= E is at most 2.5m = 40 and V = 12 > 0, so linear counting takes over: 16·ln(4/3) ≈ 4.6.
```

## When to use it, and when not

Use it for distinct counts over big streams where a small error is fine: unique visitors, distinct search queries, distinct IP addresses, `COUNT(DISTINCT …)` in Redis (PFCOUNT), BigQuery and Presto. Two sketches merge by taking the larger value in each register, so you can count each day separately and still get the distinct count for the week. Try that with averages.

Avoid it when:

- the count is small enough to keep a set (a few thousand items);
- you need the exact number, or the items themselves;
- you need to remove items. A register keeps a maximum, and a maximum can't be undone.

## Common mistakes

- Using a weak hash. Everything rests on the bits looking random. A hash such as k mod m gives leading zeros that follow the keys, not chance. (We tried simple arithmetic hashes for this page first. They overestimated by 60%.)
- Using the arithmetic mean of 2^M[j]. One lucky register swamps it.
- Forgetting the small-range correction, and reporting 10 visitors on a day with none.
- Expecting the standard error as a hard limit. About two thirds of the time the estimate is within one standard error, and sometimes it's further.

## Try this

1. Load [The first few items](#example:first-items) and keep adding items. When does the sketch stop using linear counting?
2. Add the same five items again. Does any register change? Why not?
3. Load [A hundred distinct items](#example:hundred-items), then switch the index bits b from 4 to 5 and 6 in Options. How does the error change?
4. Use the **Distinct items** preset with 100 items a few times. How often is the estimate within 26%?
