# Test driver: "load v1 v2 ..." replaces the array; "sort" sorts it and prints it.
import sys

from timsort import timsort


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] == "sort":
            timsort(a)
            print(" ".join(map(str, a)))


main()
