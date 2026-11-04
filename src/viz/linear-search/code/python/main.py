# Test driver: "load v1 v2 ..." replaces the array; "search x" prints the index of x or -1.
import sys

from linear_search import linear_search


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] == "search":
            print(linear_search(a, int(parts[1])))


main()
