# Test driver: "load v1 v2 ..." replaces the array (its length a power of two); "sort" sorts
# it and prints it.
import sys

from bitonic_sort import bitonic_sort


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] == "sort":
            bitonic_sort(a)
            print(" ".join(map(str, a)))


main()
