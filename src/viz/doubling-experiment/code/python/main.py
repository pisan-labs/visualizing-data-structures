# Test driver: reads one operation per line, prints one result per line.
# "run insertion 100 800 4821" runs the doubling loop from n = 100 to 800 on
# seed 4821's inputs and prints "n T b" for each size ("-" for the first b).
# "count insertion 20000 4821" prints the step count at one size.
# Inputs: n values from mulberry32(seed + n), each in [-999999, 999999], the
# same generator the page uses; binary search gets them sorted.
import sys

import doubling


def mulberry32(seed):
    a = seed & 0xFFFFFFFF

    def imul(x, y):
        return (x * y) & 0xFFFFFFFF

    def next_u32():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a ^ (a >> 15), a | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
        return (t ^ (t >> 14)) & 0xFFFFFFFF

    return next_u32


def make_input(name, n, seed):
    rng = mulberry32(seed + n)
    a = [-999999 + ((rng() * 1999999) >> 32) for _ in range(n)]
    return sorted(a) if name == "binary" else a


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        name = parts[1]
        algorithm = doubling.ALGORITHMS[name]
        if parts[0] == "run":
            n, largest, seed = int(parts[2]), int(parts[3]), int(parts[4])
            rows = doubling.doubling(
                algorithm, lambda m: make_input(name, m, seed), n, largest
            )
            for m, t, b in rows:
                out.append(f"{m} {t} {'-' if b is None else f'{b:.2f}'}")
        else:
            n, seed = int(parts[2]), int(parts[3])
            out.append(str(algorithm(make_input(name, n, seed))))
    sys.stdout.write("".join(line + "\n" for line in out))


main()
