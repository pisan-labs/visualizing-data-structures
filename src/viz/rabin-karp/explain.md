# Rabin-Karp

Comparing a window of the text with P takes up to m comparisons. Comparing two numbers takes one. Rabin and Karp (the paper is from 1987) turned every window into a number, its hash, and compared numbers instead. The trick is getting each window's hash from the one before in constant time, instead of reading all m characters again.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| `rabinKarp(T, P, d, q)` | Returns every shift where P occurs in T | O(n + m) when hits are rare, O(mn) at worst |

Read a window as a number in radix d. With digits and d = 10, the window 2653 is the number 2653. Keep only its remainder mod q, so the numbers stay small: 2653 mod 13 = 1. That remainder is the hash. Call P's hash p and the hash of the window at shift s t[s].

- If t[s] ≠ p, the window cannot be P, and no character is compared.
- If t[s] = p, it might be P. Compare the characters to find out.

The lane under the text holds each window's hash, under the window's first character, and the current row carries p. [Show me](#play:digits)

## Rolling the hash

Going from one window to the next drops a character on the left and brings one in on the right. With digits: 3141 becomes 1415. Take away the 3, worth 3 × 1000; multiply by 10; add the 5. In general, with h = d^(m − 1) mod q, the weight of a window's first character:

`t[s + 1] = (d · (t[s] − T[s] · h) + T[s + m]) mod q`

Mod at every step keeps the numbers small, and the answer is the same as reducing the whole window. For [the digits of π](#example:digits) with q = 13: t₀ = 3141 mod 13 = 8 and h = 1000 mod 13 = 12, so t₁ = (10 × (8 − 3 × 12) + 5) mod 13 = −275 mod 13 = 11. Check: 1415 mod 13 = 11. The narration shows the real numbers for every roll.

```check
Q: d = 10, q = 13 and h = 12. The window 1415 has hash 11. What is the hash of the next window, 4159?
* 12
- 11
- 9
- 1
= (10 × (11 − 1 × 12) + 9) mod 13 = (−10 + 9) mod 13 = −1 mod 13 = 12. Check: 4159 = 13 × 319 + 12.
```

## Spurious hits

Different windows can leave the same remainder. In [the digits of π](#example:digits), 2653 really occurs at shift 6, but the windows at 9 and 15 also hash to 1. Those are spurious hits: the character check rules them out, at the cost of a comparison or more each. In the lane, a real match's hash turns purple and a spurious hit's gets a dashed outline.

The modulus decides how often that happens. CLRS's example uses q = 13, and with only 13 possible hashes, collisions are common. With [q = 101](#example:bigger-q), the same search has no spurious hits at all. Real code uses a big prime, small enough that d × q fits in a machine word, and spurious hits become rare.

```check
Q: A window's hash equals p. What do you know about the window?
* It may be P: compare the characters to be sure
- It is P
- It is not P
- q is too small
= Equal remainders do not mean equal numbers. A window can share P's hash without being P, which is a spurious hit, so the characters still have to be checked.
```

## Digits or characters

CLRS uses digits and d = 10. Then the hash is the window read as an ordinary number, mod q, and you can check it by hand. For other text, each character is its code (A is 65) and d = 256; nothing else changes. **Radix d** in the options picks one, and Automatic chooses 10 for digits and 256 for anything else. With d = 10 forced, letters are not digits, and the search says so instead of guessing. [d = 10 needs digits](#example:needs-digits)

## How fast is it?

Hashing P and the first window takes O(m). Each roll is O(1), so the hashes of all n − m + 1 windows cost O(n). Each hit costs up to m comparisons. With few hits that adds little: O(n + m). The worst case is when every window is a hit, as in [AAA… and AAA](#example:every-shift), where every shift really matches: O(mn). A tiny q can do the same with spurious hits. Try q = 2.

## When to use it

Its strength is many patterns of the same length at once. Put their hashes in a set and roll over the text once: each window costs one lookup, however many patterns there are. Checking a document against many known sentences works this way. For one pattern and a guarantee, [KMP](/kmp/) is the safer choice.

## Common mistakes

- Taking a hash hit as a match. Without the character check, spurious hits become wrong answers.
- In Java and C++, `%` of a negative number is negative. Add q when the result is below 0.
- Using h = d^m instead of d^(m − 1).
- Hashing each window from scratch. That is m steps per window, O(mn) again.
- A big q with a small integer type: (t − T[s] · h) · d overflows. Keep d × q within the type, or reduce mod q at every step.

## Try this

- [A spurious hit at shift 6](#example:spurious-hit). Before each window, predict whether it is a hit.
- [No match, three spurious hits](#example:no-match). Then set q to 101 and run it again.
- Set q to 2 and search anything. How many hits are spurious?
- [A hit at every shift](#example:every-shift).
