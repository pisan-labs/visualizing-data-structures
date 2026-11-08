import cmath


def fft(a, inverse=False):
    """The DFT of a (len(a) a power of 2): a's polynomial at the nth roots of unity."""
    n = len(a)
    if n == 1:
        return list(a)
    sign = -1 if inverse else 1
    y0 = fft(a[0::2], inverse)  # even positions
    y1 = fft(a[1::2], inverse)  # odd positions
    y = [0] * n
    for k in range(n // 2):
        w = cmath.exp(sign * 2j * cmath.pi * k / n)  # omega_n^k
        y[k] = y0[k] + w * y1[k]
        y[k + n // 2] = y0[k] - w * y1[k]
    return y


def multiply(a, b):
    """The coefficients of a(x) * b(x): evaluate, multiply point by point, interpolate."""
    size = len(a) + len(b) - 1
    n = 2
    while n < size:
        n *= 2
    fa = fft(a + [0] * (n - len(a)))
    fb = fft(b + [0] * (n - len(b)))
    c = fft([x * y for x, y in zip(fa, fb)], inverse=True)
    return [round(z.real / n) for z in c[:size]]
