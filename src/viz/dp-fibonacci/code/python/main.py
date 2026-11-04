# Test driver: "fib n" prints F(n) bottom-up; "memo n" prints F(n) top-down with a memo.
import sys

from fibonacci import fib, fib_memo


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 2:
            continue
        n = int(parts[1])
        if parts[0] == "fib":
            print(fib(n))
        elif parts[0] == "memo":
            print(fib_memo(n))


main()
