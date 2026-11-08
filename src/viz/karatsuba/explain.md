# Karatsuba multiplication

The method you learned in school multiplies every digit of x by every digit of y: n² digit products for two n-digit numbers. For a long time people assumed you could not do better. Kolmogorov said so at a seminar in 1960. Anatoly Karatsuba, a student in the audience, found a faster method within a week.

```
KARATSUBA(x, y)
  if x < 10 or y < 10
    return x · y
  m = ⌊max(digits)/2⌋;  x = a·10^m + b;  y = c·10^m + d
  z2 = KARATSUBA(a, c)
  z0 = KARATSUBA(b, d)
  zs = KARATSUBA(a + b, c + d)
  z1 = zs − z2 − z0
  return z2·10^(2m) + z1·10^m + z0
```

| Method | Digit products for n digits |
|---|---|
| schoolbook | n² |
| split, four products | n² |
| Karatsuba, three products | about n^1.585 |

## Splitting in half

Cut both numbers in the middle: 1234 = 12·100 + 34 and 5678 = 56·100 + 78. Then

x·y = a·c·10⁴ + (a·d + b·c)·10² + b·d.

That is four half-size products, and multiplying by a power of 10 is only a shift. Set **Products per split** to four and run it. [Four products](#play:four-products) The call tree has 21 calls and 16 single-digit products. Exactly the schoolbook count. Splitting alone buys nothing: T(n) = 4T(n/2) + O(n) is still O(n²).

## The trick: three products

You don't need a·d and b·c separately. You need their sum. And

(a + b)(c + d) = a·c + a·d + b·c + b·d,

so a·d + b·c = (a + b)(c + d) − a·c − b·d. You already have a·c and b·d. One more product, (a+b)(c+d), gives the middle term with a couple of subtractions. Three products instead of four. [Show me](#play:three-products)

For 1234·5678: z2 = 12·56 = 672, z0 = 34·78 = 2652, and (12 + 34)(56 + 78) = 46·134 = 6164. So z1 = 6164 − 672 − 2652 = 2840, and the answer is 672·10⁴ + 2840·10² + 2652 = 7006652.

```check
Q: For 12·34, Karatsuba gets a·c = 3, b·d = 8 and (a+b)(c+d) = 21. What is the middle term z1?
- 21
- 11
* 10
- 13
= z1 = 21 − 3 − 8 = 10, which is a·d + b·c = 1·4 + 2·3. So 12·34 = 3·100 + 10·10 + 8 = 408.
```

## Reading the call tree

Each box is a call, labeled with its two numbers, and gets its product under it when it returns. The filled box is running; the boxes on the thick path above it are waiting for it. Each call that is not a base case has three children: a·c, b·d and the sums. The panel beside the tree shows the running call's split and the products it has so far.

Look at the third child. a + b can carry into an extra digit: 99 + 99 = 198. So that product is a little bigger than half size, and it may need one more level of splitting. [9999·9999](#example:sums-grow) takes 28 calls. It is still three products per split.

## Why n^1.585

Each level of the tree has three times as many calls as the one above, on numbers half as long. After log₂ n levels the numbers are single digits, and there are 3^(log₂ n) = n^(log₂ 3) ≈ n^1.585 of them. The adding and shifting is O(n) per call, which the Master theorem says does not change the total: T(n) = 3T(n/2) + O(n) = O(n^1.585).

For 4 digits that is 3² = 9 against 16 in theory, and the carries in the sums make it 14 for 1234·5678. Not exciting. For a million digits it is about 3 billion against 10¹²: Karatsuba wins by a factor of 300.

```check
Q: Why does splitting into four half-size products not help?
- The additions cost too much
* 4^(log₂ n) = n², the same as the schoolbook method
- The base case is too big
- It does help, a little
= Four products of half the size: T(n) = 4T(n/2) + O(n) = O(n²). Only cutting the number of products below four changes the exponent.
```

## When to use it, and common mistakes

Use it for big numbers: cryptography libraries and big-integer libraries (Python's own int multiplication, Java's BigInteger, GMP) switch to Karatsuba above a few dozen machine words, and to Toom-Cook or FFT-based methods for longer numbers still. For numbers that fit in a machine word, the hardware multiplier wins every time.

Common mistakes:

- Recursing all the way to single digits in real code. The overhead is big; real implementations stop at about 30 words and use the schoolbook method below that.
- Forgetting the carry: a + b can be one digit longer than a, so the split point must come from the longer number.
- Splitting x and y at different points. Both must use the same m, or the powers of 10 do not line up.
- Thinking it is the fastest method. Toom-3 splits into thirds (n^1.465), and FFT multiplication reaches about n log n.

## Try this

- Multiply 12·34 by hand with three products, then check it here.
- Run 1234·5678 with each setting and compare the digit products counter.
- Find two 4-digit numbers that take fewer calls than 1234·5678. What makes them cheap?
- Multiply 1000·1000. Most of the work is multiplying zeros. Would a real implementation bother?
