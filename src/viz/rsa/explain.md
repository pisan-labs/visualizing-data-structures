# RSA

RSA lets anyone send you a secret without the two of you ever sharing one. You publish a key (e, n). Anyone can use it to encrypt. Only you can decrypt, because only you know d. Rivest, Shamir and Adleman published it in 1977, and it still guards a good part of the web.

The whole thing is three ideas from the other pages on this site, put together: primes, [extended Euclid](/euclid/) and [fast modular exponentiation](/mod-pow/).

```
pick distinct primes p, q
n = p · q
φ = (p − 1)(q − 1)
pick e with gcd(e, φ) = 1
d = e⁻¹ mod φ          (extended Euclid)

encrypt:  c = m^e mod n    (square-and-multiply)
decrypt:  m = c^d mod n
```

**A warning first.** Everything on this page uses toy sizes: primes under 100, so n is under 10,000. That keeps the numbers readable. It also makes them useless for secrets. Anyone can factor n = 3233 into 61 · 53 in microseconds, and with p and q they compute d exactly as you did. Real RSA uses primes of 1024 bits or more, so n has over 600 digits.

## Making keys

Pick two primes, multiply them, and you have n. Then φ(n) = (p − 1)(q − 1) counts the numbers below n that share no factor with n. Pick a small e that shares no factor with φ(n); the page tries 2, 3, 4, ... and keeps the first that works. Then d is the inverse of e mod φ(n), which extended Euclid finds in a few rows. [Making a key pair](#play:making-keys)

| Step | Cost for β-bit primes |
|---|---|
| n, φ | two multiplications |
| e | a few gcds |
| d | one extended Euclid: O(β) divisions |
| encrypt, decrypt | one modular power: up to 2β multiplications |

Finding the two random β-bit primes is the slow part of real key generation. Toy primes skip it.

## Encrypt, decrypt

A message is a number m with 0 ≤ m < n. (Real systems turn text into numbers, and pad them first.) Encrypting is c = m^e mod n, decrypting is m = c^d mod n, and both are square-and-multiply. [Keys, encrypt, decrypt](#play:round-trip)

Why does it come back? e · d = 1 + k·φ(n) for some k, so c^d = m^(ed) = m · (m^φ(n))^k. Euler's theorem says m^φ(n) ≡ 1 (mod n) when m is coprime to n, so that is m · 1 = m. (It works for the other m too, by the Chinese remainder theorem. I'll spare you.)

```check
Q: p = 5 and q = 11. What is φ(n)?
- 55
* 40
- 54
- 16
= φ(n) = (p − 1)(q − 1) = 4 · 10 = 40. n is 55, but φ counts only the numbers below 55 that share no factor with it.
```

## Preconditions

RSA refuses some inputs, and the page does too:

- **p and q must be prime and different.** If p = q, then n = p², and anyone takes the square root.
- **e must be coprime to φ(n).** Otherwise it has no inverse, and nobody, not even you, can decrypt. [e = 15 with φ = 3120](#example:e-not-coprime)
- **m must be less than n.** The arithmetic is mod n, so a bigger m wraps around: you would decrypt m mod n, not m. [The message must be less than n](#example:message-too-big)

## φ(n) or λ(n)

CLRS uses φ(n). Real RSA (the PKCS #1 standard) uses λ(n) = lcm(p − 1, q − 1), the Carmichael function. λ(n) divides φ(n), and e · d ≡ 1 (mod λ(n)) is already enough for decryption to work, so d is often smaller. Set **Find d modulo** to λ(n) and compare: for 61 and 53, d drops from 1783 to 223. [λ(n) instead of φ(n)](#example:carmichael-lambda)

Real keys also fix e = 65537 instead of searching. It is prime, and 10000000000000001 in binary, so encrypting takes only about 17 multiplications. Here 65537 is far bigger than φ, so try [e = 17](#example:public-exponent-17) instead.

```check
Q: The public key is (e, n) = (3, 33). What is the ciphertext for m = 2?
- 6
- 2
* 8
- 9
= c = 2³ mod 33 = 8. With a message this small and e = 3, m^e is less than n and the mod does nothing, so anyone can take a cube root. Another reason real RSA pads messages.
```

## When to use it, and common mistakes

RSA is used for key exchange and digital signatures (sign with d, verify with e). It is slow compared to AES, so in practice it encrypts a random AES key and AES does the rest. Elliptic-curve cryptography gives the same security with much shorter keys, and has taken over much of RSA's work.

Common mistakes:

- Textbook RSA, with no padding. The same m always gives the same c, so an eavesdropper can guess and check small messages. Real RSA uses OAEP padding.
- Small primes, or primes too close together. Fermat's method factors n quickly when p and q are close.
- Reusing p or q across keys. gcd(n₁, n₂) finds the shared prime instantly. (This has happened, with real devices.)
- Computing m^e and then taking mod n. See the modular exponentiation page for why that never ends.

## Try this

- Make keys from 61 and 53 and encrypt 65. Then decrypt the ciphertext and check you get 65 back.
- Factor n = 3233 by hand: try dividing by primes up to √3233 ≈ 57. How long did it take you?
- Use e = 17 with the same primes. What is d? Encrypt with one key and decrypt with the other.
- Encrypt 0 and 1. Why are they bad messages?
