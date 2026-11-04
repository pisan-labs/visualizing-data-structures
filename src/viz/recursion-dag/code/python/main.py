# Test driver: reads "fib n" or "binom n k", one per line, and prints the value, the calls
# without a memo and the calls with one.
import sys

import recursion


def count(f):
    recursion.calls = 0
    value = f()
    return value, recursion.calls


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        args = [int(x) for x in parts[1:]]
        f = recursion.fib if parts[0] == "fib" else recursion.binomial
        value, plain = count(lambda: f(*args))
        _, memo = count(lambda: f(*args, {}))
        print(value, plain, memo)


main()
