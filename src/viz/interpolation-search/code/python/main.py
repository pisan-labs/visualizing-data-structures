# Test driver: "load v1 v2 ..." replaces the sorted list; "search x" prints the index found.
import sys

from interpolation_search import interpolation_search


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "load":
            a = [int(x) for x in parts[1:]]
        elif parts[0] == "search":
            print(interpolation_search(a, int(parts[1])))


main()
