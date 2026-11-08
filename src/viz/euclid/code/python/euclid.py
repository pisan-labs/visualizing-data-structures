def euclid(a, b):
    """gcd(a, b) for a, b >= 0: replace (a, b) with (b, a mod b) until b is 0."""
    if b == 0:
        return a
    return euclid(b, a % b)


def extended_euclid(a, b):
    """(d, x, y) with d = gcd(a, b) = a*x + b*y."""
    if b == 0:
        return (a, 1, 0)
    d, x, y = extended_euclid(b, a % b)
    return (d, y, x - (a // b) * y)


def mod_inverse(a, m):
    """The x in 0..m-1 with a*x = 1 (mod m), or None when gcd(a, m) is not 1."""
    d, x, _ = extended_euclid(a, m)
    if d != 1:
        return None
    return x % m
