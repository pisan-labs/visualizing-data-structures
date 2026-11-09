# String hashing

Comparing two strings of length m takes m steps. Comparing two numbers takes one. A polynomial hash turns a string into a number: read the letters as digits in base b and keep the remainder mod p. With a = 1, b = 2, …, z = 26, base 31 and p = 101, "abra" is 1·31³ + 2·31² + 18·31 + 1 = 32,272, and 32,272 mod 101 = 53. Equal strings always get equal hashes. Different strings usually get different ones. That "usually" is what this page is about.

[Rabin-Karp](/rabin-karp/) uses this hash to search for a pattern. Here we look at the hash itself: prefix hashes, substrings in O(1), rolling windows, and collisions.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `build(s)` | The hash of every prefix, H[k], and the powers P[k] = b^k mod p | O(n) |
| `hash(l, r)` | The hash of any substring s[l..r] | O(1) |
| `equal(i, j, len)` | Compare two substrings by their hashes | O(1) |
| `windows(s, k)` | The hash of every window of k letters, each rolled from the last | O(n) |

The drawing has the string, each letter's value, then H and P. H[k] is the hash of the first k letters, so it sits on the boundary before s[k], half a cell off: H[0] = 0 before the first letter, H[n] after the last. [Show me](#play:prefix-hashes)

## Prefix hashes and substrings

Building H is Horner's rule, one letter at a time: H[k + 1] = (H[k]·b + s[k]) mod p. Shift one digit left, add the next digit. [Hash every prefix in one pass](#example:prefix-hashes)

Now any substring is one subtraction. It is easiest to see in base 10 without the mod. For s = 1 2 3 4 5, H[5] = 12345 and H[2] = 12. Shift 12 three digits left, 12000, and subtract: 12345 − 12000 = 345, the substring s[2..4]. In general

hash(s[l..r]) = (H[r + 1] − H[l]·b^(r − l + 1)) mod p.

Two lookups in H, one in P, a multiply and a subtract, whatever the length. [Any substring's hash in O(1)](#example:substring-hash) gets abra from the end of abracadabra this way, and it comes out 53, the same as the abra at the start.

```check
Q: b = 10, no mod, and s = 3 1 4 1 5, so H[5] = 31415. What is H[5] − H[2]·b³?
- 314
* 415
- 31
- 3141
= H[2] = 31; shifted three digits it is 31000, and 31415 − 31000 = 415, the last three digits.
```

## Rolling a window

To hash every window of k letters, you could subtract prefix hashes, or roll. Rolling keeps one hash and updates it: take away the first letter's weight (its value times b^(k − 1)), shift by b, add the next letter. Rabin-Karp does exactly this. [Roll a window of 4 across](#example:rolling-windows) hashes all 8 windows of abracadabra, each in O(1). Windows with the same hash get the same color.

The highest power goes first here, as in CLRS. Some books write the hash the other way round, s[0] + s[1]·b + … + s[m − 1]·b^(m − 1). That works too, but a substring then comes out multiplied by b^l: comparing two substrings at different places needs an extra multiplication, and rolling needs a division (a modular inverse). With the highest power first, neither is needed.

## Collisions

There are only p possible hash values, and far more strings. So different strings must share hashes. A collision is two different strings with the same hash. The hash never lies the other way: equal strings always get equal hashes, so if the hashes differ, the strings differ, for certain. [Different hashes](#example:different-hashes)

With p = 101, abra and brac both hash to 53. They even sit next to each other in abracadabra. [A collision](#example:collision) With p = 13, 8 of the 10 windows of length 2 in mississippi share a hash with another window, and only 6 of those are real repeats. [A tiny modulus](#example:small-modulus)

How many strings until a collision is likely? It is the birthday problem: about √p. With p = 101 that is about a dozen substrings of one length. With p = 10⁹ + 7 it is about 40,000, which is fine for comparing two strings and not fine for hashing every substring of a long text.

```check
Q: p = 101. Roughly how many different substrings of one length can you hash before two of them probably share a hash?
- About 101
- About 50
* About 12
- 2
= The birthday problem: a collision becomes likely after about √(2·p·ln 2) ≈ 1.18·√101 ≈ 12 values.
```

## Double hashing

Keep two hashes with two moduli, p and p₂, and call substrings equal only when both agree. A collision now needs both to collide at once, so it is about as rare as one hash mod p·p₂. Turn on **Double hashing** in the options: [the same comparison](#example:double-hashing) now tells abra and brac apart, 53 and 33 against 53 and 76. Real code often uses two primes near 10⁹, or one modulus of 2⁶¹ − 1.

## When to use it

Use it when you compare many substrings of one string: is s[i..j] a palindrome (compare with the reverse's hash), do two substrings match, what is the longest repeated substring (binary search on the length, hash every window of that length). Each check is O(1) after an O(n) build.

Avoid trusting it when someone else picks the input. With a fixed b and p, an adversary can build strings that collide on purpose, which is how solutions get broken in programming contests. Pick b at random when the program starts, use a big modulus, and check the characters on a match when a wrong answer would hurt. If you need certainty for every substring, a [suffix array](/suffix-array/) answers the same questions with no luck involved.

## Common mistakes

- Letting a = 0. Then "b", "ab" and "aab" all hash the same: leading zeros vanish.
- A base smaller than the number of letter values. With b = 25 and a = 1 … z = 26, az = 1·25 + 26 = 51 and ba = 2·25 + 1 = 51 before any mod.
- A negative remainder. In Java and C++, (H[r + 1] − H[l]·P[len]) % p can be negative; add p.
- Overflow. H[l]·P[len] needs room for p², so use 64-bit integers with p near 10⁹.
- Taking equal hashes as proof. It is very likely, not certain.

## Try this

- Load banana, build, and compare s[1..3] with s[3..5]. Then compare s[0..1] with s[2..3].
- Set p to 13 and press **Hash every window** with 2 on mississippi. Which groups are real repeats?
- Set b to 25, load azba and compare 0 2 2. Then set b back to 31.
- Load aaaaaaaaaaaaaaaa and hash every window of 5. How many different hashes?
