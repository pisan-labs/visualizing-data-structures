# Test driver: reads "gcd a b", "ext a b" or "inverse a m", one per line, prints each result.
import sys

from euclid import euclid, extended_euclid, mod_inverse


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, a, b = parts[0], int(parts[1]), int(parts[2])
        if op == "gcd":
            print(euclid(a, b))
        elif op == "ext":
            print(*extended_euclid(a, b))
        elif op == "inverse":
            inv = mod_inverse(a, b)
            print("none" if inv is None else inv)


main()
