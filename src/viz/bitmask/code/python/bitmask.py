"""A set of small integers stored as the bits of one int: bit i is 1 when i is in the set."""


def set_bit(x, i):
    return x | (1 << i)


def clear_bit(x, i):
    return x & ~(1 << i)


def toggle_bit(x, i):
    return x ^ (1 << i)


def test_bit(x, i):
    return (x >> i) & 1


def lowest_bit(x):
    return x & -x


def popcount(x):
    count = 0
    while x != 0:
        x = x & (x - 1)  # clear the lowest 1
        count += 1
    return count


def subsets(n):
    """Every subset of {0, ..., n - 1}, as masks from 0 to 2^n - 1."""
    return list(range(1 << n))


def submasks(x):
    """Every subset of x, from x itself down to 0."""
    out = []
    sub = x
    while True:
        out.append(sub)
        if sub == 0:
            return out
        sub = (sub - 1) & x
