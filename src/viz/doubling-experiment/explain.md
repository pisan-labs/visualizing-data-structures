# Doubling experiments

You can find the Big-O of most code by counting its loops. Sometimes that is hard: the code calls a library you cannot see, or the work depends on the data, or you counted and you do not quite believe your answer. Then measure. Run the code at some size n, double n, run it again, and divide. The ratio tells you how fast it grows.

This is Sedgewick and Wayne's doubling test. The page counts the basic steps of six algorithms at n, 2n, 4n, … and fills a table; the code tabs show the algorithms with their counters. Inputs come from a seed, and counting steps instead of timing them means a replay gives the same numbers. The **Timing noise** option under **Options** puts back the mess that real timings have.

## Double n and divide

Suppose the running time is a power of n: T(n) ≈ a·nᵇ. Double n and the a cancels:

T(2n) / T(n) = a·(2n)ᵇ / (a·nᵇ) = 2ᵇ

So b = log₂ of the ratio. A ratio of 2 means b = 1, linear. A ratio of 4 means b = 2, quadratic. A ratio of 8 means b = 3, cubic. You never need to know a, which is just as well, because a depends on the machine, the language and what you decided to count.

Insertion sort on random input, from n = 100 to 12,800: the ratios are all close to 4, and b is 1.86, 2.03, 2.02, 1.98, 2.02, 2.00, 1.99. [Show me](#play:four-times-the-work)

Linear search for a value that is not there is the boring case. Every ratio is exactly 2.00. [Every ratio is 2](#example:linear-exactly-two)

```check
Q: A program takes 3 million steps for n = 1,000 and 24 million steps for n = 2,000. What is b?
- 2
* 3
- 8
- 21
= The ratio is 24 / 3 = 8, and 8 = 2³, so b = 3. A ratio of 8 per doubling is cubic.
```

## The log-log plot

Take logs of T(n) ≈ a·nᵇ and you get log T = log a + b · log n. That is a straight line, and its slope is b. Plot log T against log n and the points of a power law line up.

On the plot each doubling of n is one step to the right. The page draws a small triangle on the newest step: across, n × 2; up, T × the ratio. The slope of that segment is the b in the table.

Once the run is done the page fits a line, the model T(n) ≈ a·nᵇ. By default it takes b from the last two rows and picks a so the line goes through the last point. That is what Sedgewick and Wayne do, and there is a good reason: the biggest sizes are the least distorted. The other choice under **Options** fits a least-squares line through every point. More data sounds better. Here it is worse, because the small sizes drag the slope. For 3-sum from n = 3 the least-squares slope is 3.24, while the last two rows give 3.01. [Fitting every point drags b](#example:fit-every-point)

## Predict, then check

A model is only worth something if it predicts. Type a bigger n and press **Predict T(n)**. The page puts n into the model, draws the guess as a ring on the line, then runs the algorithm at that size and shows how far off the guess was.

For insertion sort, T(n) ≈ 0.285·n^1.99 guesses about 98.6 million comparisons at n = 20,000. The real count is 99,142,787. Off by 0.6%. [Show me](#play:predict-and-check)

Now fit the same algorithm from tiny sizes, n = 2 to 256. b comes out 1.90 instead of 2, which looks close enough. Eighty times further out, that small error in the exponent turns into a guess that is 34% low. [Predicting far from small n](#example:predict-from-small-n)

The whole experiment is cheaper than it looks. The last size costs the most. For b = 2 the sizes before it add a quarter, a sixteenth, … of its cost, so the full table costs about 4/3 of the last row alone.

## When to measure, and when to reason

Counting loops on paper gives you an exact answer and tells you why. Measuring gives you numbers and no explanation. They are partners, and I would not trust either one alone.

Measure when:

- the code calls things you cannot see into, such as a library sort or a database query;
- the cost depends on the data, and you care about your data, not the worst case;
- you did the analysis and want to check it (did I get n log n, or did I get n²?);
- the constants matter: two O(n log n) sorts can differ by a factor of 3, and only a measurement shows a.

Reason when you need a guarantee. A measurement on random input tells you nothing about the input that will break you. Counting distinct values with a hash set grows like n on every random input here, about 1.4 slots per value [A hash set grows like n](#example:hash-set-linear), but its worst case is n², when every value lands in the same cluster. No random input will show you that.

## What doubling cannot see

The doubling test assumes T(n) ≈ a·nᵇ. When the truth is not a power of n, it still gives you a b. It just gives you the wrong kind of answer.

**Log factors.** For n log n the ratio is 2(log₂ n + 1)/log₂ n, a little over 2. So b = 1 + log₂(1 + 1/log₂ n): about 1.14 at n = 1,000, 1.07 at a million, 1.05 at a billion. Merge sort's b goes 1.16, 1.14, 1.13, … 1.09 and keeps sliding. It never settles, and it never reaches 1 at any size you can run. [n log n reads as n^1.1](#example:log-factor-hides)

**Logarithms.** Binary search adds one probe each time n doubles, so the ratios fall toward 1 and b falls toward 0: 1.00, 0.58, 0.42, … 0.19 by n = 128. [log n: b creeps toward 0](#example:log-n-creeps)

**Exponentials.** For 2ⁿ the ratio T(2n)/T(n) is 2ⁿ itself, so b grows with n and never settles. If b keeps climbing, you are not looking at a power law at all.

A b that drifts in one direction is a hint. A b that settles is a power.

```check
Q: Merge sort's b reads 1.16, 1.14, 1.12, 1.10 as n doubles from 1,000 to 32,000. What is the most likely growth?
- n^1.1
* n log n
- n
- n²
= Ratios a little over 2 that keep shrinking are the mark of n log n. A real n^1.1 would read 1.10 at every size.
```

## Small n lies

Lower-order terms fade as n grows, but at small n they are a big part of the count. Brute-force 3-sum checks every triple, n(n−1)(n−2)/6 = n³/6 − n²/2 + n/3 of them. From n = 3 the ratios are 20, 11, 9.2, 8.55, … and b goes 4.32, 3.46, 3.20, 3.10, 3.05, 3.02, 3.01. Only the last few rows are worth reading. [Show me](#play:small-n-misleads)

Random input adds a wobble of its own at small sizes. Insertion sort's first ratio from n = 100 is 3.64; by n = 12,800 it is 3.96.

The fix is simple and slightly annoying: keep doubling until b stops moving. If the computer cannot get there in reasonable time, that tells you something too.

## Noise

Real timings are not step counts. Other programs run, caches warm up and go cold, the garbage collector wakes up, and the timer itself has a resolution. A short run is mostly noise. A long run averages it out.

With **Timing noise** on, each reading is the true count times a random factor, and short runs get the biggest factors. The factor comes from the seed, so a replay reads the same. One run per size from n = 10: b goes 0.69, 1.74, 2.66, 1.30, 2.46, and the model built on it guesses 30% low. [Noise: one timed run per size](#example:noise-one-run)

Take the median of five runs per size and, on the same inputs, b goes 1.76, 1.91, 1.79, 2.01, 2.18, 1.90, 2.00. The guess at n = 20,000 is within 0.1%. [The median of five steadies b](#example:noise-median) The median ignores the run where the computer decided to check for updates. The mean does not.

Binary search with noise on is a lesson of its own. Twenty probes is far less than the noise of any timer, so the readings are mostly noise. To time something that fast, time a few thousand searches in a row and divide.

## Common mistakes

- **One run per size.** One reading can be off by half. Repeat and take the median, or the minimum, which is the run with the least interference.
- **Too small n.** Lower-order terms and timer resolution both swamp small runs. If T(n) takes less than a second, double again.
- **Timing the first run.** In Java, JavaScript or Python the first run also pays for loading classes, compiling hot code and filling caches. That warm-up makes the first size look slow, the first ratio look small, and b look small. Throw the first run away.
- **Reading n log n as n^1.1.** A b a little over 1 that keeps shrinking is n log n. Likewise a b near 0 that keeps shrinking is log n.
- **Changing the input between sizes.** Sorted input at one size and random at the next measures the input, not the algorithm.
- **Trusting a.** a is the machine, the language and the compiler. Use it to predict on the same setup, never to compare two computers.

## Try this

- [Double n, four times the comparisons](#example:four-times-the-work). Before you press play, guess the ratio. Then start from n = 2 instead. Which first ratio is further from 4?
- Run merge sort from 1,000, then press **Predict T(n)** at 500,000. Is the guess too high or too low, and does that fit a b that is still sliding down?
- Turn on **Timing noise** with one run per size and run insertion sort from 10. Then switch to the median of five. Which b column would you put in a report?
- Run binary search from 1, then from 1,000. What would b be at n = a billion?
- Run 3-sum from 3 with each **Fit** option and predict n = 1,000 both times. Which model wins, and by how much?
- Open **Practice** and find out which algorithm made the table, without peeking at **Options**.
