# Test driver: reads one call per line ("factorial 5" or "tail 5"), prints each result.
import sys

from factorial import factorial, factorial_tail


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, n = parts[0], int(parts[1])
        if op == "factorial":
            print(factorial(n))
        elif op == "tail":
            print(factorial_tail(n))


main()
