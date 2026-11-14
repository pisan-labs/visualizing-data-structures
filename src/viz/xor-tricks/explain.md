# XOR tricks

A list where every value comes in pairs except one. Which one is alone? A hash map of counts finds it, and so does sorting. XOR finds it with one variable: XOR every value together and the pairs cancel themselves out. Two facts do all the work, x ^ x = 0 and x ^ 0 = x, plus one more that is easy to forget: the order does not matter.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| the single number | XOR everything; pairs cancel | Θ(n) time, O(1) extra space |
| the missing number in 0..n | XOR every index, n and every value | Θ(n) time, O(1) extra space |
| two singles | XOR everything, split by the lowest 1 bit of the result, XOR each group | Θ(n) time, O(1) extra space |
| swap without a temporary | a ^= b; b ^= a; a ^= b | Θ(1), no faster than a temporary |
| counting with a hash map | count each value, look for an odd count | Θ(n) expected time, O(n) extra space |

XOR works bit by bit: a bit of x ^ y is 1 when the two bits differ. So x ^ x is 0 in every bit, and x ^ 0 leaves x alone. Since XOR is commutative and associative, 4 ^ 1 ^ 6 ^ 4 ^ 9 ^ 6 ^ 1 is the same as (4 ^ 4) ^ (1 ^ 1) ^ (6 ^ 6) ^ 9 = 9, whatever order the values come in. [Show me](#play:single-xor)

The **Approach** option switches to counting with a hash map. Both give the same answer. The variables count the work: `bit ops` is one XOR or AND of two numbers, or one negation, `lookups` is one hash map read or write, and `kept` is how many numbers each approach holds on to. Watch `kept`: that is where the trick wins.

## The single number

Start acc at 0 and XOR in each value. In [Pairs cancel, one is left](#example:single-xor), A = 4 1 6 4 9 6 1, and acc goes 4, 5, 3, 7, 14, 8, 9. Look at the step after the second 4: acc is 7 = 1 ^ 6, the values still without a partner. The 4 is gone. At the end only 9 has no partner. 7 XORs and one number kept.

The bits panel shows each XOR as three rows: acc, the value, and the result. A 1 that came in is marked new; a 1 that met another 1 and cancelled is marked removed.

The trick needs pairs only in the sense of an even count. [Three copies leave one](#example:three-times) has 7 three times: two of them cancel and one is left, so the answer is 7. Four copies would vanish completely.

```check
Q: What is 5 ^ 3 ^ 5?
- 0
* 3
- 5
- 6
= The two 5s cancel, whatever the order: 5 ^ 5 ^ 3 = 0 ^ 3 = 3.
```

The naive way counts. [Counting with a hash map](#example:single-hash-map) builds count = {4: 2, 1: 2, 6: 2, 9: 1}, then looks for the odd count: 18 lookups, 4 counts kept. Is XOR faster? Both are O(n). On this list it is 7 steps against 18, and a hash lookup usually costs much more than an XOR, but the real gain is space: one number instead of a map that grows with the list. Sorting would need no map, but it costs O(n log n), and it changes the list.

## The missing number

n different numbers from 0 to n: one is missing. XOR them with every index 0..n − 1 and with n itself. Every number that is there now appears twice, once as a value and once as an index (or as n), and cancels. The missing one appears only once.

[The missing number](#example:missing-xor) has A = 3 0 6 1 5 2, so n = 6. Start acc at 6, then XOR in 0 and 3, 1 and 0, 2 and 6, and so on. 12 XORs leave 4.

You could add 0 + 1 + … + n = n(n + 1)/2 and subtract the sum of the values. That works too, but with fixed-size integers the sum can overflow; XOR never makes a number bigger than its inputs' bits. [The missing number with a set](#example:missing-set) takes 11 lookups and keeps all 6 values. Here the set does fewer steps than XOR's 12. It still keeps n values, and XOR keeps one.

## Two singles

Now two values, a and b, have no partner. XOR everything and you get x = a ^ b. That is not one of them, but it is not 0 either, since a ≠ b. Wherever x has a 1, a and b differ. Take the lowest such bit: x & −x keeps only the lowest 1 of x (in two's complement, −x flips every bit of x and adds 1, so everything below that bit is 0 in both, and everything above it differs). Then split the values by that bit and XOR each group. Both copies of a pair have the same bits, so a pair lands in one group and cancels there. a lands in one group and b in the other.

[Two singles, split by one bit](#example:two-singles) has A = 7 10 5 7 9 10. x = 12 = 1100, so low = 0100 = 4. 7 and 5 have that bit: group 1, which XORs to 5. 10 and 9 do not: group 0, which XORs to 9. The answer is 5 and 9, after 20 bit ops and four numbers kept. [Two singles with a hash map](#example:two-hash-map) takes 16 lookups and keeps 4 counts. At this size the map's counts are no bigger; give it a list of 10,000 values and it holds 5,001, while XOR still holds four.

```check
Q: The two singles XOR to x = 6, which is 110 in binary. What is x & −x?
* 2
- 4
- 6
- 1
= x & −x keeps only the lowest 1 of x. 110 has its lowest 1 in the 2s place, so the values split by whether they have a 2 in them.
```

## Swap without a temporary

a ^= b; b ^= a; a ^= b. After the first, a holds the mix a ^ b. XOR that with b and the b cancels, leaving the old a. XOR the mix with that and the old a cancels, leaving the old b. [Swap with three XORs](#example:swap-xor) swaps A[1] = 1 and A[4] = 9: A[1] becomes 1 ^ 9 = 8, A[4] becomes 9 ^ 8 = 1, and A[1] becomes 8 ^ 1 = 9.

Is it worth it? Not really. [Swap with a temporary](#example:swap-temp) also takes three steps, and it is clearer. And the XOR swap has a trap: swap a slot with itself and the first step is x ^= x, which makes it 0, and the value is gone. [Swapping a value with itself](#example:swap-self) shows the check that guards against it. Learn the XOR swap because it explains how the other tricks work, then use a temporary.

## Spot it

Reach for XOR when the problem says:

- **every value appears twice except one** (or except two), or "an even number of times";
- **find the missing one** among **0 to n** or **1 to n**, and the values are **distinct**;
- **constant extra space**, **no extra memory**, or **without a hash map**, together with one of the above;
- **pairs** of something that should cancel: matching socks, opened and closed tags with ids, toggles.

Three problems of our own:

- A log lists the id of a light each time someone flips its switch. Every light started off, and at the end all but one are off again. Which one is on? (Single number: a light flipped an even number of times is off.)
- Seats 0 to n in a theater, n tickets sold, no seat sold twice. Which seat is empty? (Missing number.)
- Every student in a list of sign-ups signed up twice, except two who signed up once. Find both, using a few variables. (Two singles.)

Look-alikes that call for something else: "every value appears three times except one" breaks XOR, because three copies do not cancel; count the 1s in each bit position mod 3 instead, with the bit operations of [bitmasks](/bitmask/). "One value repeats, the list is 1 to n" is a [cycle detection](/floyd-cycle/) problem when you may not change the list. And "the value that appears most often" needs [frequency counting](/frequency-counting/): XOR only knows odd from even.

## When to use it

Use it when the question is about parity: which values appear an odd number of times. It needs whole numbers (or anything you can turn into bits), and it needs the promise in the problem, such as "every other value appears exactly twice". Without that promise XOR still returns a number, just a meaningless one.

Avoid it when you need counts, or when the data does not keep its promise. A hash map ([chaining](/hash-chaining/)) answers more questions: which values repeat, how often, and where. If the list is small, the map's extra space does not matter, and its code says what it means.

## Common mistakes

- Starting acc at 1, or at the first value and then XORing it in again. Start at 0.
- Forgetting n in the missing number: XOR the indices 0..n − 1, n itself and every value.
- Using x & (x − 1) for the splitting bit. That clears the lowest 1 instead of keeping it; you want x & −x.
- Thinking a group's XOR is "a and some pairs". The pairs are in it too, and they cancel: one group's XOR is a, the other's is b.
- Swapping a value with itself with XOR. Check i ≠ j first.
- Using XOR when values can appear three times. Odd and even is all it knows.

## Try this

- [Pairs cancel, one is left](#example:single-xor): before you run it, predict acc after the second 6.
- Load `9 4 9 4 4` and press Find. What is left, and why is it not 0?
- [Two singles, split by one bit](#example:two-singles): which group would 12 go to? Load a list with two 12s and check.
- Set Find to the missing number, load `0 1 2 3`, and press Find. Which number is missing?
- Press Compare, set one side to counting with a hash map, and fill both with "Big values (six bits)" at 9. Watch `kept`.
