# Euclid and extended Euclid

The greatest common divisor of two numbers, gcd(a, b), is the largest number that divides both: gcd(240, 46) = 2. You could try every number from 46 down to 1. Euclid found something much better about 2,300 years ago, and it is still the algorithm everyone uses.

```
EUCLID(a, b)
  if b == 0
    return a
  else return EUCLID(b, a mod b)
```

Three lines. It might be the oldest algorithm still in production.

## Why the remainder works

Write a = q·b + r, where r = a mod b. Anything that divides a and b also divides r = a − q·b. Anything that divides b and r also divides a = q·b + r. So the pairs (a, b) and (b, r) have exactly the same common divisors, and the same gcd. The numbers get smaller every call, and when b reaches 0 the answer is sitting in a, because gcd(a, 0) = a.

The table has one row per call. Each row's b slides down to become the next row's a, and its remainder becomes the next row's b. [Show me](#play:remainders)

| | Cost |
|---|---|
| gcd(a, b) | O(log b) calls, one division each |
| extended gcd | the same calls, plus one step per call on the way back |
| modular inverse | one extended gcd |

If a is smaller than b, nothing breaks. a mod b is just a, so the first call swaps them and costs one extra call. [The smaller number first](#example:smaller-first)

## How fast? Lamé and Fibonacci

The worst case is two consecutive Fibonacci numbers. Every quotient is 1, so each remainder is only a little smaller than the number before it, and the pair walks all the way down the Fibonacci sequence: (144, 89), (89, 55), (55, 34)... [Ten calls for gcd(144, 89)](#play:consecutive-fibonacci)

Lamé proved this in 1844 (it is often called the first result in computational complexity): if a > b ≥ 1 and Euclid makes k recursive calls, then b ≥ F(k+1). Fibonacci numbers grow like 1.618^k, so k is at most about 4.8 times the number of decimal digits of b. The notes beside the table show your call count and the bound for your numbers.

The best case is when b divides a. One call, remainder 0, done. [One call](#example:divides-evenly)

```check
Q: Which pair makes Euclid take the most calls?
- (100, 99)
* (89, 55)
- (96, 64)
- (99, 9)
= 89 and 55 are consecutive Fibonacci numbers: every quotient is 1, so the numbers shrink as slowly as they possibly can. (100, 99) looks close but is done in two calls: 100 mod 99 = 1.
```

## Extended Euclid

Switch **Version** to extended. Now each call also returns x and y with a·x + b·y = d, the gcd. These are Bézout coefficients, and they always exist.

```
EXTENDED-EUCLID(a, b)
  if b == 0
    return (a, 1, 0)
  (d', x', y') = EXTENDED-EUCLID(b, a mod b)
  return (d', y', x' − ⌊a/b⌋·y')
```

Going down is the same as before. The base case is easy: a·1 + 0·0 = a. Coming back up, each row takes x' and y' from the row below and works out its own: x = y', and y = x' − ⌊a/b⌋·y'. That is the back-substitution you may have done by hand in a discrete math class, done by the recursion instead. [240·(−9) + 46·47 = 2](#play:bezout)

Why does it work? The row below says b·x' + (a mod b)·y' = d. Replace a mod b with a − ⌊a/b⌋·b and collect terms: a·y' + b·(x' − ⌊a/b⌋·y') = d. Nothing fancy. Just algebra.

## Modular inverses

The inverse of a mod m is the number x with a·x ≡ 1 (mod m). RSA needs one to find its private key, and so does anything that divides in modular arithmetic. Run extended Euclid on (a, m). If the gcd is 1, then a·x + m·y = 1, and the m·y part vanishes mod m. So x is the inverse (add m if it came out negative). [The inverse of 7 mod 40](#play:inverse-exists)

If the gcd is not 1, there is no inverse at all. [6 mod 15](#example:no-inverse)

```check
Q: Extended Euclid on (7, 40) returns (1, −17, 3). What is the inverse of 7 mod 40?
- 17
- 3
* 23
- There is none
= 7·(−17) + 40·3 = 1, so 7·(−17) ≡ 1 (mod 40). −17 + 40 = 23, and 7·23 = 161 = 4·40 + 1.
```

## When to use it, and common mistakes

Use it whenever you need a gcd: reducing fractions, lcm(a, b) = a·b / gcd(a, b), checking that two numbers are coprime, and modular inverses for cryptography. It is fast enough that there is rarely a reason to look further. (Binary gcd swaps division for shifts, which helps on hardware where division is slow.)

Common mistakes:

- Subtracting instead of taking the remainder. a − b also keeps the gcd, but gcd(1000, 1) then takes 999 steps instead of one.
- Forgetting that x can be negative. In Java and C++, −17 % 40 is −17, not 23. Add m and take mod m again.
- Checking for an inverse by searching every x from 1 to m − 1. It works for 40. It does not work for a 2048-bit modulus.
- Mixing up the order on the way back: x gets the old y, and y gets x' − ⌊a/b⌋·y'.

## Try this

- Run gcd on 233 and 144, then on 233 and 143. Why is the second one so much shorter?
- Switch to extended and run (240, 46). Check the top row's identity yourself on a calculator.
- Find the inverse of 3 mod 26 (a Caesar-style cipher key), then try 13 mod 26. Why does one fail?
- Pick any b under 100 and try to beat Lamé's bound. You can't, but have a go.
