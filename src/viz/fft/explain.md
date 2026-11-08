# Fast Fourier transform

Multiplying two polynomials of degree n the obvious way multiplies every coefficient of one by every coefficient of the other: O(n²). The fast Fourier transform does it in O(n log n), by a detour. Turn each polynomial into its values at n special points, multiply the values (n multiplications), and turn the result back into coefficients.

The detour only pays because the special points, the complex nth roots of unity, let you evaluate a polynomial at all n of them in O(n log n). That evaluation is the FFT. Cooley and Tukey published it in 1965; Gauss had it around 1805, and did not bother to publish. (Of course.)

| | Cost |
|---|---|
| evaluate at n points, one by one | O(n²) |
| FFT: evaluate at the n roots of unity | O(n log n) |
| multiply polynomials with FFTs | O(n log n) |

## The roots of unity

ω = e^(2πi/n) is the complex number one nth of the way around the unit circle. Its powers 1, ω, ω², …, ω^(n−1) are the n points where zⁿ = 1, spaced evenly around the circle. The circle beside the network shows them, and lights up the power of ω each butterfly uses.

Two facts make the FFT work. Squaring the n roots of unity gives the n/2 roots of unity, each twice. And ω^(k + n/2) = −ω^k: the root halfway around is the negative.

## Divide: evens and odds

Split a(x) = a₀ + a₁x + a₂x² + … into its even and odd coefficients:

a(x) = a_even(x²) + x · a_odd(x²).

Evaluating at the n roots of unity needs a_even and a_odd at their squares, which are only the n/2 roots of unity. Two half-size problems. Recursively, all the way down to single values.

```
RECURSIVE-FFT(a)
  n = a.length
  if n == 1 return a
  ωₙ = e^(2πi/n);  ω = 1
  y⁰ = RECURSIVE-FFT(a₀, a₂, …, aₙ₋₂)
  y¹ = RECURSIVE-FFT(a₁, a₃, …, aₙ₋₁)
  for k = 0 to n/2 − 1
    y[k] = y⁰[k] + ω·y¹[k]
    y[k + n/2] = y⁰[k] − ω·y¹[k]
    ω = ω·ωₙ
  return y
```

## The butterfly network

Unroll the recursion and you get the picture. The first column is the input after all the even/odd splitting: for n = 8 that is a₀ a₄ a₂ a₆ a₁ a₅ a₃ a₇, each index with its bits reversed. Each later column combines pairs of blocks into blocks twice the size. Each combine step takes two values, multiplies the lower one by a power of ω, and writes the sum on top and the difference below. The crossing lines look like a butterfly, hence the name. [Show me](#play:four-points)

Every box shows a complex number rounded to two decimals, real part over imaginary part. The last column is y in natural order: y[k] is the polynomial at ω^k.

log₂ n columns of n/2 butterflies: (n/2) log₂ n multiplications. For n = 8 that is 12 against 64. For n = a million, 10 million against a trillion. [Eight points](#example:eight-points)

```check
Q: What is y[0], the transform's first output, for a = [3, 1, 4, 1]?
- 3
- 0
* 9
- 12
= y[0] is the polynomial at ω⁰ = 1, which is just the sum of the coefficients: 3 + 1 + 4 + 1 = 9.
```

## Multiplying polynomials

Click **Multiply polynomials** with two coefficient lists, lowest power first, separated by a bar: `1 2 | 3 4` is (1 + 2x)(3 + 4x).

1. Pick n, a power of 2 bigger than the product's degree, and pad with zeros.
2. FFT both: their values at the n roots of unity.
3. Multiply the values point by point.
4. Inverse FFT: the same network with ω⁻¹ in place of ω, then divide by n.

[(1 + 2x)(3 + 4x)](#play:multiply-two-lines) gives 3 + 10x + 8x². The inverse comes out as numbers like 9.999999999 in floating point, so the last step rounds. [A product that needs eight points](#example:multiply-quadratics)

Why does the inverse look like the forward transform? The DFT is multiplication by a matrix V with entries ω^(jk). Its inverse has entries ω^(−jk)/n. Same shape, other direction around the circle, divided by n.

```check
Q: Two polynomials of degree 3 are multiplied with FFTs. What is the smallest n that works?
- 4
* 8
- 6
- 16
= The product has degree 6, so seven coefficients, and n must be a power of 2 at least 7: 8.
```

## Two sign conventions

CLRS uses ω = e^(2πi/n). numpy, MATLAB and most signal-processing books use e^(−2πi/n) for the forward transform and save the plus sign for the inverse. Set **Root of unity** and compare: outputs y[1] and y[n − 1] swap, and so do y[2] and y[n − 2]. [The other sign](#example:other-sign) Neither is wrong. Mixing them up is.

## When to use it, and common mistakes

Use it for polynomial and big-integer multiplication, convolution (blurring an image, filtering audio), and anything that talks about frequencies: audio compression, MRI, Wi-Fi. Real code uses the iterative, in-place version of this same network, and a library (FFTW, numpy.fft).

Common mistakes:

- Forgetting to pad. Two degree-3 polynomials need 8 points, not 4; with 4 the high terms wrap around onto the low ones.
- Forgetting to divide by n after the inverse transform.
- Not rounding. Floating point gives 9.999999 where you wanted 10.
- Big numbers. Coefficients near 2⁵³ lose precision in doubles; exact work uses a number-theoretic transform (the same algorithm with roots of unity mod a prime).

## Try this

- Transform [1, 0, 0, 0] and [0, 1, 0, 0]. What do the outputs look like on the circle?
- Transform [1, 1, 1, 1]. Why are three outputs zero?
- Multiply 1 1 | 1 1 and then 1 1 1 | 1 1 1. Do you recognize the coefficients?
- Multiply 1 2 3 | 4 5 6 by hand. Count your multiplications, and compare with the butterflies the FFT makes.
