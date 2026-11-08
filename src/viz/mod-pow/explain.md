# Fast modular exponentiation

RSA, Diffie-Hellman and primality tests all need a^b mod m with b in the hundreds of digits. Multiplying by a, b − 1 times, would finish some time after the sun burns out. Square-and-multiply does it in about 2 log₂ b multiplications: for a 2048-bit exponent, about 3,000.

The trick is the binary form of b. 13 is 1101 in binary, so a^13 = a^8 · a^4 · a^1, and you get a^8 from a by squaring three times.

| | Multiplications |
|---|---|
| naive: a · a · ... · a | b − 1 |
| square-and-multiply | one squaring per bit of b, plus one multiply per 1 bit: at most 2 log₂ b |

## Bits from the left

This is the version in CLRS. Keep d = a^c mod m, where c is the part of b read so far, and start with c = 0 and d = 1.

```
c = 0;  d = 1
for i = k downto 0
  c = 2c;  d = d · d mod m
  if bᵢ == 1
    c = c + 1;  d = d · a mod m
return d
```

Reading one more bit doubles c (so square d), and if the bit is 1, adds one to it (so multiply by a). For 7^13 mod 11, c goes 1, 3, 6, 13, and d keeps up: 7, 2, 4, 2. [Show me](#play:square-and-multiply)

You don't need c to compute anything. CLRS keeps it so you can see that d really is a^c the whole time. The first squaring is 1 · 1, which is wasted, but who's counting. (We are. The counter counts it.)

```check
Q: Reading the bits from the left, which operations does a^6 need? (6 is 110 in binary.)
* square, multiply, square, multiply, square
- square, square, square
- multiply, square, multiply, square
- square, multiply, square, square, multiply
= Every bit squares, and every 1 multiplies right after: 1 → S M, 1 → S M, 0 → S.
```

## Bits from the right

Switch **Read the bits of b** to the right. Now the loop keeps a second number p, which runs through a, a², a⁴, a⁸ mod m by squaring, and multiplies p into the result wherever the bit is 1. For 7^13 that is 7 · 7⁴ · 7⁸. [The same power, from the right](#play:right-to-left)

This is the version most people write, because it needs no bit count up front: test b & 1, shift b right, repeat. It makes about the same number of multiplications as the left-to-right one. The left-to-right one always multiplies by the same a, which helps when a is small or fixed.

## Why reduce every time

The numbers never get big. Every multiplication is followed by mod m, so d stays below m and every product below m². 7^560 has 474 digits; computing it mod 561 never needs more than six. [7^560 mod 561](#play:fermat-liar)

That example is a little famous, by the way. 561 = 3 · 11 · 17 is not prime, but a^560 ≡ 1 (mod 561) for every a coprime to 561, so Fermat's primality test is fooled every time. Numbers like this are called Carmichael numbers, and they are why real primality tests (Miller-Rabin) look a bit deeper.

## Best and worst cases

The number of squarings is fixed by the number of bits. The multiplies depend on the 1s. A power of two has a single 1: [one multiply](#example:power-of-two-exponent). All ones, like 1023, gets a multiply for every bit: [twenty multiplications for 2^1023](#example:all-ones). The naive loop takes 1022.

```check
Q: About how many multiplications does square-and-multiply need for a 64-bit exponent?
- 64
* Between 64 and 128
- About 2⁶⁴
- 4096
= 64 squarings, plus one multiply for each 1 bit, so between 64 and 128.
```

## When to use it, and common mistakes

Use it for any power mod m: RSA encryption and decryption, Diffie-Hellman, Fermat and Miller-Rabin tests, hashing. The same idea (repeated squaring) also computes Fibonacci numbers with 2×2 matrices and powers of graphs' adjacency matrices.

Common mistakes:

- Computing a^b first and taking mod m at the end. The number has b · log a bits. Your computer will let you know.
- Overflow. With 64-bit integers the product d · d must fit, so m has to stay under 2³². Bigger moduli need 128-bit products or a big-number library.
- Forgetting b = 0. The answer is 1 (or 0 if m is 1).
- Thinking it is O(log b) time. It is O(log b) multiplications. Each one costs more as the numbers get longer.

Python has it built in, by the way: `pow(a, b, m)`. Java has `BigInteger.modPow`.

## Try this

- Compute 3^100 mod 7 on paper first, then check it here.
- Run 2^1023 and then 2^512 mod 997. 512 is the smaller exponent, but it has just as many bits. Which needs fewer multiplications, and why?
- Run the same power with both settings and compare the counters.
- Find an exponent under 1000 that needs exactly 15 multiplications.
