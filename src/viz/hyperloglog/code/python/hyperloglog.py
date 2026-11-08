import math

BITS = 16  # hash width


def hash16(x):
    """MurmurHash3's 32-bit finalizer, keeping the top 16 bits."""
    h = x & 0xFFFFFFFF
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h >> 16


class HyperLogLog:
    """m = 2^b registers; each keeps the largest rho seen."""

    def __init__(self, b):
        self.b = b
        self.m = 1 << b
        self.M = [0] * self.m

    def add(self, x):
        h = hash16(x)
        rest = BITS - self.b
        j = h >> rest  # the first b bits pick the register
        w = h & ((1 << rest) - 1)
        rho = rest - w.bit_length() + 1  # leading zeros of w, plus 1
        self.M[j] = max(self.M[j], rho)
        return j, rho

    def estimate(self):
        alpha = {16: 0.673, 32: 0.697, 64: 0.709}.get(self.m, 0.7213 / (1 + 1.079 / self.m))
        z = sum(2.0 ** -v for v in self.M)
        e = alpha * self.m * self.m / z
        zeros = self.M.count(0)
        if e <= 2.5 * self.m and zeros > 0:
            e = self.m * math.log(self.m / zeros)  # small-range correction
        return e
