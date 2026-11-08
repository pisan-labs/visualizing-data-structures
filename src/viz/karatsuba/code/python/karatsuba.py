calls = 0  # counts the calls, to compare with the call tree


def karatsuba(x, y):
    """x * y for x, y >= 0, with three recursive products per split instead of four."""
    global calls
    calls += 1
    if x < 10 or y < 10:
        return x * y
    m = max(len(str(x)), len(str(y))) // 2
    a, b = divmod(x, 10**m)  # x = a * 10^m + b
    c, d = divmod(y, 10**m)  # y = c * 10^m + d
    z2 = karatsuba(a, c)
    z0 = karatsuba(b, d)
    z1 = karatsuba(a + b, c + d) - z2 - z0  # = a*d + b*c
    return z2 * 10 ** (2 * m) + z1 * 10**m + z0
