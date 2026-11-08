from math import gcd

# Toy RSA: the arithmetic is right, but numbers this small are broken in a blink.


def make_keys(p, q, e=None):
    """(n, e, d) from distinct primes p and q. e defaults to the smallest that works."""
    n = p * q
    phi = (p - 1) * (q - 1)
    if e is None:
        e = 2
        while gcd(e, phi) != 1:
            e += 1
    if gcd(e, phi) != 1:
        raise ValueError("e must be coprime to phi")
    d = pow(e, -1, phi)  # the inverse of e mod phi, by extended Euclid
    return n, e, d


def encrypt(m, e, n):
    """c = m^e mod n, for 0 <= m < n."""
    return pow(m, e, n)  # square-and-multiply


def decrypt(c, d, n):
    """m = c^d mod n."""
    return pow(c, d, n)
