# Test driver: reads "fib n" or "memo n", one per line, and prints the value and the calls made.
import sys

import fibonacci


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, n = parts[0], int(parts[1])
        fibonacci.calls = 0
        value = fibonacci.fib(n) if op == "fib" else fibonacci.fib_memo(n, {})
        print(value, fibonacci.calls)


main()
