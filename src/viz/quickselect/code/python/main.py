# Test driver: "load v1 v2 ..." replaces the array; "select k" prints the k-th smallest value.
import sys

from quickselect import quickselect


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] == "select":
            print(quickselect(a, int(parts[1])))


main()
